import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import Topbar from './components/Topbar.jsx';
import ChannelStrip from './components/ChannelStrip.jsx';
import TrackLane from './components/TrackLane.jsx';
import Ruler from './components/Ruler.jsx';
import EffectModal from './components/EffectModal.jsx';
import ExportModal from './components/ExportModal.jsx';
import Modal from './components/Modal.jsx';
import SelectionBar from './components/SelectionBar.jsx';
import BottomFxBar from './components/BottomFxBar.jsx';
import { processEffect, destructiveBuffer } from './audio/applyEffect.js';
import { EFFECTS, BAKED_EFFECT_IDS } from './audio/effectsConfig.js';
import { makeSampleBuffer, audioBufferToWav, cloneBuffer, extractBufferRegion, replaceBufferRegion, logBands } from './audio/dsp.js';
import { encodeBuffer } from './audio/exportEncoders.js';
import { draftPut, draftAll, draftDel } from './audio/draftStore.js';

let uid = 0;
const nextId = () => ++uid;

/* Panjang klip di TIMELINE (detik transport). playbackRate mengubah berapa lama
   buffer berbunyi, jadi setiap perhitungan lebar/fit/scroll harus lewat sini —
   bukan t.buf.duration mentah. */
const laneDur = (t) => (t && t.buf ? t.buf.duration / (t.playbackRate || 1) : 0);

/* fxChain <-> snapshot. Node Tone tidak bisa diserialisasi, tapi id + params
   bisa — dan itu cukup untuk membangun ulang node yang IDENTIK. Menyimpan
   nama saja (versi lama) membuat undo/draft memulihkan efek dengan parameter
   default dan membuat export melewatinya. */
const serializeFx = (t) => (t.fxChain || []).map((f) => ({ type: f.type, id: f.id, params: f.params || {} }));

/* Bangun ulang fxChain dari snapshot. Menerima format lama (array nama) supaya
   draft & undo history yang sudah ada tidak pecah — nama saja berarti parameter
   default, sama seperti perilaku sebelumnya. */
async function rebuildFxChain(fxSnap) {
    const out = [];
    for (const f of fxSnap || []) {
        const rec = typeof f === 'string' ? { type: f, id: null, params: {} } : f;
        const eff = EFFECTS.find((e) => e.id === rec.id) || EFFECTS.find((e) => e.name === rec.type);
        if (!eff) continue;
        try {
            const res = await processEffect(eff, rec.params || {});
            if (res && res.fx && res.fx.node) out.push({ type: res.fx.type, id: eff.id, params: rec.params || {}, node: res.fx.node });
        } catch (e) {}
    }
    return out;
}

/* Tone.Panner default-nya channelCount:1 explicit, yang me-downmix stereo jadi
   mono (−3 dB, kanal kanan hilang). Semua panner di app ini lewat sini supaya
   tidak ada satu pun jalur yang diam-diam memono-kan audio user. */
const makePanner = (pan = 0) => new Tone.Panner({ pan, channelCount: 2 });

const HELP_SNIPPET = `• Space — Play / Pause
• Drag audio ke area track untuk menambah
• M — Mute, S — Solo (per track)
• Klik chip efek (mis. "Gain ✕") untuk menghapusnya
• Klik "+ Efek" pada track untuk menambah efek
• Klik ruler / waveform untuk seek
• Scroll pada timeline untuk geser mendatar (Shift+scroll bila banyak track)
• ⌘+scroll pada timeline untuk zoom
• Edit → Snap to Grid untuk magnet ke beat
• Edit → Metronome untuk click saat play
• File → Export / Download untuk mix ke WAV
• Draft disimpan di IndexedDB browser (audio ikut tersimpan)`;

/* Rencana untuk satu event wheel di timeline. Dipisah dari komponen supaya
 percabangannya bisa diuji tanpa layout browser (jsdom clientWidth = 0).
   - Ctrl/⌘  → zoom, anchored di kursor
   - deltaX  → biarkan native overflow-x (trackpad geser mendatar)
   - deltaY  → geser mendatar KALAU tidak ada ruang scroll vertikal, atau Shift
               ditahan; mouse wheel biasa hanya punya deltaY, tanpa ini ia mati. */
export function wheelPlan(e, el) {
    if (e.ctrlKey || e.metaKey) return { kind: 'zoom', factor: e.deltaY < 0 ? 1.4 : 1 / 1.4 };
    if (e.deltaX !== 0) return { kind: 'native' };
    if (!e.shiftKey && el.scrollHeight - el.clientHeight > 1) return { kind: 'native' };
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return { kind: 'native' };
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // DOM_DELTA_LINE
    return { kind: 'x', next: Math.max(0, Math.min(max, el.scrollLeft + dy)) };
}

/* Auto-follow playhead saat play. `armed` = false berarti user baru menggeser
 timeline sendiri, jadi JANGAN rebut scroll-nya (bug: "scroll saat play malah
 balik ke bagian yang sedang berjalan"). Follow menyala lagi sendiri begitu
 playhead kembali masuk viewport — tanpa timer, tanpa tombol. */
export function followPlan(px, scrollLeft, clientWidth, armed) {
    if (clientWidth <= 0) return { armed, scrollTo: null };
    const margin = clientWidth * 0.25;
    const outside = px < scrollLeft || px > scrollLeft + clientWidth - margin;
    if (!outside) return { armed: true, scrollTo: null };
    if (!armed) return { armed: false, scrollTo: null };
    return { armed: true, scrollTo: Math.max(0, px - clientWidth * 0.6) };
}

export default function App() {
    const [tracks, setTracks] = useState([]);
    const [playing, setPlaying] = useState(false);
    const [pos, setPos] = useState(0);
    const [bpm, setBpm] = useState(120);
    const [loop, setLoop] = useState(false);
    const [snap, setSnap] = useState(false);
    const snapRef = useRef(false);
    useEffect(() => {
        snapRef.current = snap;
    }, [snap]);
    const [metronome, setMetronome] = useState(false);
    const metroRef = useRef(null); // Tone synth for the click
    const metroEvent = useRef(null); // scheduleRepeat id
    const [waveColors, setWaveColors] = useState(true);
    const [vu, setVu] = useState(true);
    const [compact, setCompact] = useState(false);
    const [modal, setModal] = useState(null); // { type, trackId?, effectId?, payload? }
    const [toast, setToast] = useState(null);
    const [selected, setSelected] = useState(null); // trackId
    const [fxBarOpen, setFxBarOpen] = useState(false); // bottom fx rack visibility
    const [selStart, setSelStart] = useState(null); // selection region start (seconds, clip-local)
    const [selEnd, setSelEnd] = useState(null); // selection region end (seconds, clip-local)
    const [selTrackId, setSelTrackId] = useState(null); // which track's clip is selected
    const [recording, setRecording] = useState(false);
    const [vuLevels, setVuLevels] = useState({});
    const toastTimer = useRef(null);
    const [pxPerSec, setPxPerSec] = useState(80);
    const scrollRef = useRef(null); // ref for timeline-scroll (native scroll, no React state)
    const rangeRef = useRef(null); // ref for the range input (updated imperatively)
    const channelColRef = useRef(null); // sidebar column — scroll vertikalnya di-mirror dari timeline
    const channelInnerRef = useRef(null); // isi sidebar — digeser via transform saat timeline discroll
    const scrollMaxRef = useRef(0); // max scrollLeft (updated when contentWidth changes)
    const posRef = useRef(0); // mirrors `pos` for the 60fps playhead (no React re-render)
    const playheadRef = useRef(null); // single DOM playhead inside the scrollable content
    const pxRef = useRef(80); // mirrors pxPerSec so the rAF loop always sees the latest zoom
    const clockRef = useRef(0); // last time we pushed `pos` to React (clock text is throttled)
    const fileInput = useRef(null);
    const urlInput = useRef(null);
    const recInput = useRef(null);
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const histRef = useRef([]);
    const redoRef = useRef([]);
    const playingRef = useRef(false);
    /* playingRef mencerminkan `playing` supaya seekTo() bisa tahu transport sedang
     jalan TANPA memasukkan `playing` ke dependency array — kalau masuk, seekTo
     dibuat ulang tiap play/pause dan handler klik lane memegang versi basi. */
    useEffect(() => {
        playingRef.current = playing;
    }, [playing]);
    const timelineRef = useRef(null);
    const [viewW, setViewW] = useState(0);

    /* horizontal timeline scroll: shared scrollbar below the track audio */
    const followRef = useRef(true); // auto-follow playhead aktif? dimatikan saat user scroll manual
    const selfScrollRef = useRef(-1); // scrollLeft terakhir yang KITA tulis (bukan user)
    /* satu-satunya jalur untuk menggeser timeline dari kode: menandai nilainya
     supaya onScroll bisa membedakan "kita" vs "user menggeser sendiri". */
    const scrollTo = (v) => {
        const el = scrollRef.current;
        if (!el) return;
        selfScrollRef.current = v;
        el.scrollLeft = v;
        if (rangeRef.current) rangeRef.current.value = String(v);
    };
    const channelW = compact ? 196 : 280;
    const maxDur = tracks.reduce((m, t) => Math.max(m, laneDur(t) + (t.offset || 0)), 0);
    const viewW0 = viewW || 0;
    /* timeline width = at least the viewport, plus room for the longest clip,
     plus a minimum overscan so the horizontal scrollbar is always usable */
    const contentWidth = Math.max(viewW0 - channelW, Math.round(maxDur * pxPerSec) + 160, Math.round((viewW0 - channelW) * 1.6));
    const hasOverflow = tracks.length > 0 && contentWidth > viewW0 - channelW + 2;
    /* keep scrollLeft inside the valid range when width changes (zoom/resize/load) */
    useEffect(() => {
        const max = Math.max(0, contentWidth - (viewW0 - channelW));
        scrollMaxRef.current = max;
        const el = scrollRef.current;
        if (el) scrollTo(Math.min(max, el.scrollLeft));
        if (rangeRef.current) {
            rangeRef.current.max = String(Math.max(0, max));
            rangeRef.current.value = String(Math.min(max, rangeRef.current.value || 0));
        }
    }, [contentWidth, viewW0, channelW]);
    useEffect(() => {
        const measure = () => {
            if (timelineRef.current) setViewW(timelineRef.current.clientWidth);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);
    useEffect(() => {
        if (timelineRef.current) setViewW(timelineRef.current.clientWidth);
    }, [tracks.length]);
    /* tinggi scrollbar horizontal native di .timeline-scroll — dipakai sebagai
     margin-bottom sidebar supaya tinggi viewport keduanya identik (strip tidak
     pernah "kelebihan" 1 baris dibanding lane). */
    const [hbarH, setHbarH] = useState(0);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const h = el.offsetHeight - el.clientHeight;
        if (h !== hbarH) setHbarH(h);
    }, [tracks.length, contentWidth, viewW0, compact, hbarH]);

    const flash = useCallback((msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 1800);
    }, []);

    /* ---------- history (undo/redo) ---------- */
    /* SATU bentuk snapshot untuk push/undo/redo. Sebelumnya bentuknya ditulis
       tiga kali dan gampang tidak sinkron — `baked` (resep efek destruktif)
       harus ada di ketiganya, kalau tidak undo mengembalikan daftar chip tapi
       tidak mengembalikan sampelnya. */
    const snapTracks = (list) =>
        JSON.stringify(
            list.map((t) => ({
                id: t.id,
                name: t.name,
                volumeDb: t.volumeDb,
                pan: t.pan,
                mute: t.mute,
                solo: t.solo,
                color: t.color,
                fx: serializeFx(t), // id + params: node dibangun ulang identik
                baked: (t.baked || []).map((r) => ({ id: r.id, params: r.params || {}, region: r.region || null })),
                playbackRate: t.playbackRate || 1,
                pitchComp: t.pitchComp || 0,
                offset: t.offset || 0,
            })),
        );

    const pushHistory = useCallback(() => {
        histRef.current.push(snapTracks(tracks));
        if (histRef.current.length > 40) histRef.current.shift();
        redoRef.current = [];
        setHistory([...histRef.current]);
    }, [tracks]);

    const undo = useCallback(() => {
        if (!histRef.current.length) return flash('Tidak ada history');
        const prev = histRef.current.pop();
        setHistory([...histRef.current]);
        redoRef.current.push(snapTracks(tracks));
        setRedoStack([...redoRef.current]);
        restoreFromJson(prev);
        flash('Undo');
    }, [tracks]);

    const redo = useCallback(() => {
        if (!redoRef.current.length) return flash('Tidak ada redo');
        const next = redoRef.current.pop();
        setRedoStack([...redoRef.current]);
        histRef.current.push(snapTracks(tracks));
        setHistory([...histRef.current]);
        restoreFromJson(next);
        flash('Redo');
    }, [tracks]);

    /* Rebuild a track list from a JSON snapshot. Audio buffers survive because
     destructive edits replace t.buf (not the file); fx nodes are re-created from
     id + params lewat rebuildFxChain, jadi parameter yang di-tweak user kembali utuh. */
    const restoreFromJson = async (json) => {
        try {
            const snap = JSON.parse(json);
            const byId = {};
            tracks.forEach((t) => (byId[t.id] = t));
            const newTracks = [];
            for (const s of snap) {
                const old = byId[s.id];
                if (!old) continue;
                const nt = { ...old, name: s.name, volumeDb: s.volumeDb, pan: s.pan, mute: s.mute, solo: s.solo, color: s.color, offset: s.offset || 0, playbackRate: s.playbackRate || 1, pitchComp: s.pitchComp || 0, fxChain: [] };
                nt.fxChain = await rebuildFxChain(s.fx);
                /* Efek destruktif ada di SAMPEL, bukan di node — jadi undo/redo harus
                   me-render ulang buffer dari origBuf mengikuti daftar resep snapshot.
                   Tanpa ini chip-nya hilang dari rack tapi audionya tetap ter-edit. */
                const recipes = Array.isArray(s.baked) ? s.baked.map((r) => ({ ...r, region: r.region || undefined })) : [];
                const prevKey = JSON.stringify((old.baked || []).map((r) => ({ id: r.id, params: r.params || {}, region: r.region || null })));
                const nextKey = JSON.stringify(recipes.map((r) => ({ id: r.id, params: r.params || {}, region: r.region || null })));
                nt.baked = recipes;
                if (prevKey !== nextKey && (old.origBuf || old.buf)) {
                    const nb = await rebake(old, recipes);
                    if (nb) {
                        if (nt.player) {
                            try {
                                nt.player.dispose();
                            } catch (e) {}
                        }
                        nt.origBuf = old.origBuf || old.buf;
                        nt.buf = nb;
                        nt.player = new Tone.Player({ url: nb, loop: false });
                    }
                }
                reconnect(nt);
                newTracks.push(nt);
            }
            setTracks(newTracks);
        } catch (e) {
            flash('Undo gagal: ' + (e && e.message ? e.message : e));
        }
    };

    /* ---------- audio graph ---------- */
    const reconnect = (t) => {
        try {
            if (t.player) {
                t.player.disconnect();
                /* playbackRate hidup di objek track, bukan cuma di instance player —
                   setiap edit destruktif membuat Player baru, dan tanpa baris ini
                   kecepatan yang di-set user balik ke 1x tanpa pemberitahuan. */
                if (t.playbackRate) t.player.playbackRate = t.playbackRate;
                /* Preserve Pitch: satu PitchShift dikelola di sini (bukan di fxChain,
                   supaya tidak muncul sebagai slot yang bisa dihapus user dan tidak
                   ikut hilang saat chain diedit). */
                if (t.pitchComp) {
                    if (!t._pitchNode) t._pitchNode = new Tone.PitchShift();
                    t._pitchNode.pitch = t.pitchComp;
                } else if (t._pitchNode) {
                    try {
                        t._pitchNode.dispose();
                    } catch (e) {}
                    t._pitchNode = null;
                }
                // chain: player → panner → (pitchComp) → (fxChain) → volume → meter → destination
                let node = t.player;
                if (t.panner) {
                    try {
                        node.connect(t.panner);
                        node = t.panner;
                    } catch (e) {}
                }
                if (t._pitchNode) {
                    try {
                        node.connect(t._pitchNode);
                        node = t._pitchNode;
                    } catch (e) {}
                }
                for (const fx of t.fxChain || []) {
                    if (!fx.node) continue;
                    try {
                        node.connect(fx.node);
                        node = fx.node;
                    } catch (e) {}
                }
                node.connect(Tone.Destination);
                if (t.meter) t.player.connect(t.meter); // meter reads from source
            }
        } catch (e) {}
    };

    const makeBuffer = async (arrayBuf) => {
        const ctx = Tone.context.rawContext || Tone.context._ctx || new (window.AudioContext || window.webkitAudioContext)();
        return await ctx.decodeAudioData(arrayBuf);
    };

    const makeTrack = async (name, buf, offset = 0) => {
        const player = new Tone.Player({ url: buf, loop: false });
        const panner = makePanner(0);
        const meter = new Tone.Meter({ normalRange: false });
        player.chain(panner, meter);
        const t = { id: nextId(), name, buf, player, panner, meter, fxChain: [], volumeDb: 0, pan: 0, mute: false, solo: false, color: trackColor(tracks.length), offset };
        await Tone.loaded();
        reconnect(t);
        pushHistory();
        setTracks((prev) => [...prev, t]);
        flash(`Track "${name}" ditambahkan`);
        return t;
    };

    const loadFile = async (file) => {
        try {
            const arrayBuf = await file.arrayBuffer();
            const buf = await makeBuffer(arrayBuf);
            await makeTrack(file.name, buf);
            /* tampilkan seluruh waveform dulu (fit-to-width); user zoom sendiri kalau mau edit */
            const dur = Math.max(buf.duration, ...tracks.map((t) => laneDur(t) + (t.offset || 0)), 0);
            fitToWidth(dur);
        } catch (e) {
            flash('Gagal memuat audio: ' + (e && e.message ? e.message : e));
        }
    };

    const loadSample = async () => {
        try {
            const buf = await makeSampleBuffer();
            await makeTrack('Sample (Tone Chord)', buf);
            const dur = Math.max(buf.duration, ...tracks.map((t) => laneDur(t) + (t.offset || 0)), 0);
            fitToWidth(dur);
        } catch (e) {
            flash('Gagal memuat sample: ' + (e && e.message ? e.message : e));
        }
    };

    /* empty track (no audio yet) — from the sidebar "+ Add Track" button */
    const addTrack = () => {
        const player = new Tone.Player({ loop: false });
        const panner = makePanner(0);
        const meter = new Tone.Meter({ normalRange: false });
        player.chain(panner, meter);
        const t = { id: nextId(), name: 'Track ' + (tracks.length + 1), buf: null, player, panner, meter, fxChain: [], volumeDb: 0, pan: 0, mute: false, solo: false, color: trackColor(tracks.length), offset: 0, collapsed: false };
        reconnect(t);
        pushHistory();
        setTracks((prev) => [...prev, t]);
        setSelected(t.id);
        flash('Track kosong ditambahkan');
    };

    /* toggle metronome: schedule starts on next play */
    const toggleMetronome = () => {
        setMetronome((v) => {
            const nv = !v;
            if (!nv && metroEvent.current) {
                try {
                    Tone.Transport.clear(metroEvent.current);
                } catch (e) {}
                metroEvent.current = null;
            }
            return nv;
        });
        flash('Metronome ' + (metronome ? 'off' : 'on'));
    };

    /* zoom keeping the anchor x (px inside the content, e.g. cursor) fixed */
    const zoomAt = useCallback(
        (factor, anchorX) => {
            setPxPerSec((p) => {
                const np = Math.min(400, Math.max(20, Math.round(p * factor)));
                const newContent = Math.max(viewW0 - channelW, Math.round(maxDur * np) + 160, Math.round((viewW0 - channelW) * 1.6));
                const newMax = Math.max(0, newContent - (viewW0 - channelW));
                const target = Math.max(0, anchorX * (np / p) - elClientHalf());
                requestAnimationFrame(() => {
                    const el = scrollRef.current;
                    if (!el) return;
                    const clamped = Math.min(newMax, Math.max(0, target));
                    scrollTo(clamped);
                    scrollMaxRef.current = newMax;
                });
                pxRef.current = np;
                return np;
            });
        },
        [maxDur, viewW0, channelW],
    );

    /* wheel di timeline: Ctrl/⌘ = zoom (anchored di kursor), sisanya scroll.
     Mouse wheel HANYA menghasilkan deltaY, jadi kalau tidak ada ruang scroll
     vertikal (kasus umum: 1-2 track) deltaY dipakai untuk menggeser timeline
     horizontal — kalau tidak, wheel terasa mati. Shift = paksa horizontal.
     deltaX (trackpad) dibiarkan ke native overflow-x. */
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e) => {
            const plan = wheelPlan(e, el);
            if (plan.kind === 'native') return;
            e.preventDefault();
            if (plan.kind === 'zoom') {
                const rect = el.getBoundingClientRect();
                zoomAt(plan.factor, e.clientX - rect.left);
            } else {
                followRef.current = false; // scroll manual menang atas auto-follow
                el.scrollLeft = plan.next;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    function elClientHalf() {
        const el = scrollRef.current;
        return el ? el.clientWidth / 2 : 0;
    }

    const zoomBy = useCallback(
        (factor) => {
            const el = scrollRef.current;
            const anchor = el ? el.scrollLeft + el.clientWidth / 2 : 0;
            setPxPerSec((p) => {
                const np = Math.min(400, Math.max(20, Math.round(p * factor)));
                const newContent = Math.max(viewW0 - channelW, Math.round(maxDur * np) + 160, Math.round((viewW0 - channelW) * 1.6));
                const newMax = Math.max(0, newContent - (viewW0 - channelW));
                const target = anchor * (np / p) - (el ? el.clientWidth / 2 : 0);
                requestAnimationFrame(() => {
                    const clamped = Math.min(newMax, Math.max(0, target));
                    scrollTo(clamped);
                    scrollMaxRef.current = newMax;
                });
                pxRef.current = np;
                return np;
            });
        },
        [maxDur, viewW0, channelW],
    );
    const zoomIn = useCallback(() => zoomBy(1.4), [zoomBy]);
    const zoomOut = useCallback(() => zoomBy(1 / 1.4), [zoomBy]);

    /* Fit-to-width — pilih pxPerSec sehingga SELURUH durasi timeline muat di
     viewport, lalu reset scroll ke awal. Dipakai otomatis saat file baru
     dimuat (durasi belum masuk state → lewat durOverride) dan oleh tombol Fit. */
    const fitToWidth = useCallback(
        (durOverride) => {
            const el = scrollRef.current;
            const avail = (el ? el.clientWidth : viewW0 - channelW) - 40;
            const dur = durOverride != null ? durOverride : maxDur;
            if (!dur || dur <= 0 || avail <= 0) return;
            const np = Math.min(400, Math.max(20, Math.floor(avail / dur)));
            pxRef.current = np;
            setPxPerSec(np);
            requestAnimationFrame(() => {
                const e2 = scrollRef.current;
                if (e2) scrollTo(0);
                scrollMaxRef.current = 0;
            });
        },
        [maxDur, viewW0, channelW],
    );

    /* Feature 1 — focus a track: select it AND auto-scroll the timeline so its
     clip is centered in the viewport (the "click track → jump to its clip"). */
    const focusTrack = useCallback(
        (id, opts) => {
            setSelected(id);
            setFxBarOpen(true);
            /* Auto-scroll (memusatkan klip) HANYA untuk pemilihan dari sidebar. Klik di
       waveform lewat opts.scroll===false: user sudah menatap titik yang diklik,
       jadi menggeser viewport ke tengah klip persis saat itu = "playhead tiba-tiba
       lompat ke tengah". Ini sumber bug tersebut, bukan matematika px→detik. */
            if (opts && opts.scroll === false) return;
            const t = tracks.find((x) => x.id === id);
            const el = scrollRef.current;
            if (!t || !el) return;
            const left = (t.offset || 0) * pxPerSec;
            const w = laneDur(t) * pxPerSec;
            const view = el.clientWidth;
            const max = scrollMaxRef.current;
            let target = left - view / 2 + w / 2;
            target = Math.max(0, Math.min(max, target));
            scrollTo(target);
        },
        [tracks, pxPerSec],
    );

    const loadUrl = async (url) => {
        try {
            flash('Mengunduh audio…');
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const arrayBuf = await res.arrayBuffer();
            const buf = await makeBuffer(arrayBuf);
            await makeTrack(url.split('/').pop().split('?')[0] || 'URL Audio', buf);
            const dur = Math.max(buf.duration, ...tracks.map((t) => laneDur(t) + (t.offset || 0)), 0);
            fitToWidth(dur);
        } catch (e) {
            flash('Gagal memuat URL: ' + (e && e.message ? e.message : e));
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = Tone.context.rawContext || new (window.AudioContext || window.webkitAudioContext)();
            const rec = new MediaRecorder(stream);
            recInput.current = { stream, rec };
            const chunks = [];
            rec.ondataavailable = (e) => {
                if (e.data.size) chunks.push(e.data);
            };
            rec.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const arrayBuf = await blob.arrayBuffer();
                    const buf = await makeBuffer(arrayBuf);
                    await makeTrack('Recording', buf);
                } catch (e) {
                    flash('Rekaman gagal diproses: ' + (e && e.message ? e.message : e));
                }
                stream.getTracks().forEach((t) => t.stop());
                recInput.current = null;
                setRecording(false);
            };
            rec.start();
            setRecording(true);
            flash('Rekam… klik Stop Recording untuk selesai');
        } catch (e) {
            flash('Mikrofon tidak tersedia: ' + (e && e.message ? e.message : e));
        }
    };
    const stopRecording = () => {
        const r = recInput.current;
        if (r) {
            try {
                r.rec.stop();
            } catch (e) {}
        }
    };

    const saveDraft = async () => {
        try {
            const key = 'kael-draft-' + Date.now();
            const draft = {
                key,
                bpm,
                tracks: tracks.map((t) => ({
                    name: t.name,
                    volumeDb: t.volumeDb,
                    pan: t.pan,
                    mute: t.mute,
                    solo: t.solo,
                    color: t.color,
                    offset: t.offset || 0,
                    fx: serializeFx(t), // id + params → node dibangun ulang identik
                    /* resep efek destruktif; audio yang disimpan adalah buffer ASLI,
                       jadi chip-nya masih bisa dilepas setelah draft dimuat. */
                    baked: (t.baked || []).map((r) => ({ id: r.id, params: r.params || {}, region: r.region || null })),
                    playbackRate: t.playbackRate || 1,
                    pitchComp: t.pitchComp || 0,
                    /* Blob, bukan blob-URL: URL.createObjectURL mati begitu tab
                       ditutup, jadi draft lama selalu kehilangan audionya. */
                    wav: t.origBuf || t.buf ? audioBufferToWav(t.origBuf || t.buf) : null,
                })),
            };
            await draftPut(key, draft);
            /* ponytail: sisakan 8 draft terbaru — WAV penuh per track cepat
               memenuhi kuota IndexedDB, dan simpan yang gagal karena kuota
               cuma muncul sebagai pesan error. Bikin UI hapus manual kalau
               user butuh kontrol lebih. */
            const old = (await draftAll()).map((x) => x.key).sort().slice(0, -8);
            for (const k of old) await draftDel(k);
            flash('Draft disimpan: ' + key.replace('kael-draft-', ''));
        } catch (e) {
            flash('Gagal simpan draft: ' + (e && e.message ? e.message : e));
        }
    };
    const loadDraft = async () => {
        try {
            const all = await draftAll();
            if (!all.length) return flash('Tidak ada draft tersimpan');
            setModal({ type: 'draft', payload: all.sort((a, b) => (a.key < b.key ? 1 : -1)) });
        } catch (e) {
            flash('Gagal buka draft: ' + (e && e.message ? e.message : e));
        }
    };

    /* Ganti seluruh sesi dengan isi draft: decode tiap WAV kembali ke
       AudioBuffer, bangun track baru, buang track lama beserta player-nya. */
    const applyDraft = async (d) => {
        try {
            flash('Memuat draft…');
            const built = [];
            for (let i = 0; i < d.tracks.length; i++) {
                const s = d.tracks[i];
                const orig = s.wav ? await makeBuffer(await s.wav.arrayBuffer()) : null;
                /* WAV draft = buffer ASLI. Efek destruktif diterapkan ulang dari
                   resep supaya hasil audionya sama DAN chip-nya masih bisa dilepas. */
                const recipes = Array.isArray(s.baked) ? s.baked.map((r) => ({ ...r, region: r.region || undefined })) : [];
                const buf = orig && recipes.length ? await rebake({ origBuf: orig }, recipes) : orig;
                const player = buf ? new Tone.Player({ url: buf, loop: false }) : new Tone.Player();
                const panner = makePanner(s.pan || 0);
                const meter = new Tone.Meter({ normalRange: false });
                player.chain(panner, meter);
                player.volume.value = s.volumeDb || 0;
                player.mute = !!s.mute;
                const nt = {
                    id: nextId(),
                    name: s.name,
                    buf,
                    origBuf: orig || undefined,
                    baked: recipes,
                    player,
                    panner,
                    meter,
                    fxChain: await rebuildFxChain(s.fx),
                    playbackRate: s.playbackRate || 1,
                    pitchComp: s.pitchComp || 0,
                    volumeDb: s.volumeDb || 0,
                    pan: s.pan || 0,
                    mute: !!s.mute,
                    solo: !!s.solo,
                    color: s.color || trackColor(i),
                    offset: s.offset || 0,
                };
                built.push(nt);
            }
            await Tone.loaded();
            built.forEach(reconnect);
            tracks.forEach((t) => {
                try {
                    t.player && t.player.dispose();
                } catch (e) {}
            });
            pushHistory();
            setTracks(built);
            setSelected(null);
            if (d.bpm) {
                setBpm(d.bpm);
                try {
                    Tone.Transport.bpm.value = d.bpm;
                } catch (e) {}
            }
            setModal(null);
            const dur = Math.max(0, ...built.map((t) => laneDur(t) + (t.offset || 0)));
            if (dur > 0) fitToWidth(dur);
            flash(`Draft dimuat — ${built.length} track`);
        } catch (e) {
            flash('Gagal memuat draft: ' + (e && e.message ? e.message : e));
        }
    };

    /* ---------- transport ---------- */
    const playStartRef = useRef({ real: 0, transport: 0 });
    const rafId = useRef(null);

    const play = async () => {
        /* already playing -> pause (Topbar shows ⏸ while playing) */
        if (playing) {
            try {
                Tone.Transport.pause();
            } catch (e) {}
            setPlaying(false);
            flash('Pause');
            return;
        }

        /* AudioContext starts 'suspended' until a user gesture resumes it. AWAIT the
       resume — starting the Transport against a suspended context makes the clock
       sit at 0 and nothing is audible. */
        try {
            await Tone.start();
            const c = Tone.getContext();
            if (c && c.rawContext && c.rawContext.state !== 'running') {
                await c.rawContext.resume();
            }
        } catch (e) {}
        try {
            const c = Tone.getContext();
            if (c && c.state && c.state !== 'running') {
                flash('Klik sekali di halaman untuk mengizinkan audio');
                return;
            }
        } catch (e) {}

        try {
            Tone.Transport.loop = !!loop;
        } catch (e) {}

        /* sync every player to the Transport exactly ONCE, so Transport.pause(),
       .stop() and .seconds (seek) all drive the audio. Without sync the players
       run free: play works but pause/seek/stop look dead. */
        for (const t of tracks) {
            try {
                t.player.loop = !!loop;
                t.player.unsync();
                t.player.sync();
                t._synced = true;
                /* start the player at transport time = t.offset so each clip
           plays from its own position in the timeline (audio joiner) */
                t.player.start(t.offset || 0, 0);
            } catch (e) {}
        }

        Tone.Transport.start();
        /* metronome: schedule a click on the Transport so it follows pause/seek */
        if (metronome) {
            try {
                if (!metroRef.current) metroRef.current = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 2, volume: -6 }).toDestination();
                const metro = metroRef.current;
                if (!metroEvent.current) {
                    metroEvent.current = Tone.Transport.scheduleRepeat((time) => {
                        try {
                            metro.triggerAttackRelease('C3', '0.05', time);
                        } catch (e) {}
                    }, '4n');
                }
            } catch (e) {}
        }
        playStartRef.current = { real: performance.now(), transport: Tone.Transport.seconds };
        followRef.current = true; // play baru = ikuti playhead lagi
        setPlaying(true);
        flash('Play');
    };
    const stop = () => {
        Tone.Transport.stop();
        Tone.Transport.seconds = 0;
        for (const t of tracks) {
            try {
                t.player.loop = false;
            } catch (e) {}
            /* unschedule the per-offset start events — the next play() re-schedules them */
            try {
                t.player._scheduled.forEach((s) => Tone.Transport.clear(s));
            } catch (e) {}
            try {
                t.player._scheduled = [];
            } catch (e) {}
        }
        if (metroEvent.current) {
            try {
                Tone.Transport.clear(metroEvent.current);
            } catch (e) {}
            metroEvent.current = null;
        }
        setPos(0);
        posRef.current = 0;
        if (playheadRef.current) playheadRef.current.style.transform = 'translateX(0px)';
        setPlaying(false);
        flash('Stop');
    };

    /* 60fps rAF playhead: moves the single DOM playhead imperatively,
     and throttles React state updates to ~120ms for the clock display. */
    useEffect(() => {
        if (!playing) return;
        const tick = () => {
            try {
                /* Transport.seconds is the single source of truth — the context is
           guaranteed running by play(), so no wall-clock fallback is needed
           (a fake clock would move the playhead while audio is silent). */
                const p = Tone.Transport.seconds;
                posRef.current = p;

                /* auto-stop at the end of the longest track (unless looping) */
                if (!loop && maxDur > 0 && p >= maxDur) {
                    try {
                        Tone.Transport.stop();
                        Tone.Transport.seconds = 0;
                    } catch (e) {}
                    posRef.current = 0;
                    if (playheadRef.current) playheadRef.current.style.transform = 'translateX(0px)';
                    setPos(0);
                    setPlaying(false);
                    return;
                }

                /* move the single playhead element imperatively */
                if (playheadRef.current) {
                    const px = p * pxRef.current;
                    playheadRef.current.style.transform = `translateX(${px}px)`;

                    /* keep the playhead in view while playing — TAPI jangan rebut scroll
             kalau user baru menggeser timeline sendiri (followRef=false). */
                    const el = scrollRef.current;
                    if (el) {
                        const fp = followPlan(px, el.scrollLeft, el.clientWidth, followRef.current);
                        followRef.current = fp.armed;
                        if (fp.scrollTo != null) scrollTo(fp.scrollTo);
                    }
                }

                /* throttle React state updates for the clock display */
                const now = performance.now();
                if (now - clockRef.current > 120) {
                    setPos(p);
                    clockRef.current = now;
                }
            } catch (e) {}
            rafId.current = requestAnimationFrame(tick);
        };
        rafId.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId.current);
    }, [playing, loop, maxDur]);

    /* click-to-seek on the ruler: convert a click's content x (ruler is inside
     the scrollable content, so no scroll offset math) to seconds. */
    const seekTo = useCallback(
        (sec, opts) => {
            let s = Math.max(0, +sec || 0);
            /* snap to whole beats when enabled (1/4 note grid at current BPM) */
            if (snapRef.current) {
                const beat = 60 / (bpm || 120);
                s = Math.round(s / beat) * beat;
            }
            /* Re-arm tiap player yang tersinkron ke Transport. WAJIB unsync()+sync(),
       BUKAN stop()+start(): player.stop() menulis state 'stopped' pada detik yang
       sama dengan posisi seek, jadi _syncedStart() Tone membaca 'stopped' dan
       tidak memutar apa pun — itulah sebabnya klik waveform saat play dulu
       membuat audio mati. unsync() membersihkan _scheduled + _state, lalu
       start(offset) mendaftarkan tepat satu event; Tone sendiri yang menghitung
       posisi buffer (transport.seconds − offset) saat Transport 'start' dipancarkan.

       Kalau tadi sedang play: pause dulu, re-arm, lalu start lagi. Urutan ini
       persis jalur play() yang sudah terbukti bekerja, jadi audio LANJUT dari
       titik yang diklik alih-alih diam atau mundur ke 0. */
            const wasPlaying = playingRef.current;
            try {
                if (wasPlaying) Tone.Transport.pause();
            } catch (e) {}
            try {
                Tone.Transport.seconds = s;
            } catch (e) {}
            try {
                for (const t of tracks) {
                    if (!t.player || !t.buf) continue;
                    const off = t.offset || 0;
                    const dur = laneDur(t);
                    t.player.loop = !!loop;
                    t.player.unsync();
                    t.player.sync();
                    t._synced = true;
                    /* klip yang seluruhnya sudah terlewat tidak perlu dijadwalkan lagi */
                    if (s < off + dur) t.player.start(off, 0);
                }
            } catch (e) {}
            try {
                if (wasPlaying) Tone.Transport.start();
            } catch (e) {}
            posRef.current = s;
            setPos(s);
            /* move the shared playhead immediately — the rAF loop that normally drives
       it is suspended when the tab is hidden, so seeking must not depend on it. */
            if (playheadRef.current) {
                playheadRef.current.style.transform = `translateX(${s * pxRef.current}px)`;
            }
            /* Auto-follow HANYA kalau target di luar viewport, dan geser SEMINIMAL
       mungkin ke tepi (bukan ke tengah). Seek dari klik user memakai
       opts.follow===false: titik itu sudah terlihat, jadi menggeser viewport
       justru yang membuat playhead terasa "tiba-tiba lompat ke tengah". */
            const el = scrollRef.current;
            if (el && !(opts && opts.follow === false)) {
                const px = s * pxRef.current;
                const view = el.clientWidth;
                const max = Math.max(0, el.scrollWidth - view);
                let target = null;
                if (px < el.scrollLeft + 8) target = px - 8;
                else if (px > el.scrollLeft + view - 8) target = px - view + 8;
                if (target != null) {
                    scrollTo(Math.max(0, Math.min(max, target)));
                }
            }
        },
        [bpm, tracks, loop],
    );

    /* Seek yang berasal dari klik langsung di timeline (ruler / waveform):
     viewport TIDAK pernah digeser — titik yang diklik jelas sudah terlihat. */
    const seekFromClick = useCallback((sec) => seekTo(sec, { follow: false }), [seekTo]);

    /* keep pxRef in sync with zoom, and reposition the playhead whenever the
     rAF loop isn't running (paused / stopped / after zoom or seek). */
    useEffect(() => {
        pxRef.current = pxPerSec;
    }, [pxPerSec]);
    useEffect(() => {
        if (playing) return;
        if (playheadRef.current) {
            playheadRef.current.style.transform = `translateX(${(posRef.current || 0) * pxPerSec}px)`;
        }
    }, [playing, pos, pxPerSec, tracks.length]);

    /* ---------- export ---------- */
    const exportMix = async (cfg) => {
        const _cfg = cfg || { fileName: 'kael-mixing-mix.wav', format: 'wav', bitDepth: 16, dither: false, channels: 2, range: 'whole' };
        try {
            if (!tracks.length) return flash('Tidak ada track untuk diekspor');
            /* rate > 1 memendekkan klip, jadi durasi render ikut dibagi rate —
               kalau tidak, ekspor kepanjangan (atau terpotong saat rate < 1). */
            const dur = Math.max(...tracks.map((t) => laneDur(t) + (t.offset || 0)), 1);
            const sr = 44100;
            const numCh = _cfg.channels === 1 ? 1 : 2;
            /* Tone.Offline, bukan OfflineAudioContext mentah: node Tone terikat pada
               context tempat ia dibuat, jadi fxChain yang hidup di context online
               tidak bisa dipakai di sini. Di dalam callback ini processEffect() yang
               sama dipanggil ulang dengan params tersimpan, sehingga hasil ekspor
               memakai jalur DSP yang identik dengan yang didengar user. */
            const renderedBuf = await Tone.Offline(async () => {
                for (const t of tracks) {
                    if (!t.buf) continue;
                    /* skip muted tracks, and non-soloed tracks when any track is soloed */
                    if (t.mute) continue;
                    if (tracks.some((x) => x.solo) && !t.solo) continue;
                    const src = new Tone.Player(t.buf);
                    src.playbackRate = t.playbackRate || 1;
                    /* channelCount:2 lewat makePanner — default Tone (1, explicit)
                       me-downmix stereo jadi mono (−3 dB, kanal kanan hilang). */
                    const panner = makePanner(t.pan || 0);
                    const gain = new Tone.Gain(Math.pow(10, (t.volumeDb || 0) / 20));
                    const fxNodes = [];
                    /* Preserve Pitch ikut dirender, kalau tidak hasil ekspor beda
                       dari yang didengar user di timeline. */
                    if (t.pitchComp) fxNodes.push(new Tone.PitchShift({ pitch: t.pitchComp }));
                    for (const fx of t.fxChain || []) {
                        const eff = EFFECTS.find((e) => e.id === fx.id);
                        if (!eff) continue; /* efek lama dari draft/undo tanpa id — dilewati */
                        try {
                            const res = await processEffect(eff, fx.params || {});
                            if (res && res.fx && res.fx.node) fxNodes.push(res.fx.node);
                        } catch (e) {}
                    }
                    src.chain(panner, ...fxNodes, gain, Tone.getDestination());
                    /* start each clip at its timeline offset — joining tracks end-to-end */
                    src.start(t.offset || 0);
                }
            }, dur, numCh, sr);
            const out = renderedBuf.get ? renderedBuf.get() : renderedBuf;
            const blob = await encodeBuffer(out, _cfg);
            const name = (_cfg.fileName && _cfg.fileName.split('/').pop()) || 'kael-mixing-mix.wav';
            downloadBlob(blob, name);
            flash('Mix diekspor (' + (_cfg.format || 'wav').toUpperCase() + ')');
        } catch (e) {
            flash('Export gagal: ' + (e && e.message ? e.message : e));
        }
    };
    const openExport = () => setModal({ type: 'export' });

    /* ---------- effects ---------- */
    /* Semua edit yang MENULIS KE SAMPEL dicatat sebagai resep {id, params, region?}
       dan diterapkan ulang dari origBuf. Satu buffer asli + daftar resep jauh lebih
       murah daripada snapshot buffer per efek (~63 MB per 3 menit stereo), dan
       membuat hapus/edit di tengah tumpukan jadi benar dengan sendirinya.
       ponytail: region dicatat dalam detik relatif buffer saat itu — resep yang
       mengubah panjang (Remove Silence) menggeser region resep sesudahnya. Simpan
       region sebagai fraksi kalau itu mulai mengganggu. */
    const rebake = async (t, recipes) => {
        let buf = t.origBuf || t.buf;
        for (const r of recipes) {
            const eff = EFFECTS.find((e) => e.id === r.id);
            if (!eff || !buf) continue;
            if (r.region) {
                const s = Math.max(0, r.region[0]);
                const e2 = Math.min(buf.duration, r.region[1]);
                if (e2 - s < 0.01) continue;
                const slice = extractBufferRegion(buf, s, e2);
                if (!slice) continue;
                const res = await processEffect(eff, r.params || {});
                /* fx realtime di-bake offline ke region; efek destruktif jalan langsung */
                const done = res && res.fx ? await renderRegionFx(slice, eff, r.params || {}) : await destructiveBuffer(eff, slice, r.params || {});
                if (done) buf = replaceBufferRegion(buf, s, e2, done);
            } else {
                const nb = await destructiveBuffer(eff, buf, r.params || {});
                if (nb) buf = nb;
            }
        }
        return buf;
    };

    /* Satu jalur untuk seluruh daftar resep: render ulang buffer, bangun Player
       baru, simpan origBuf sekali. Dipakai saat menambah, mengedit, dan menghapus
       efek destruktif — jadi ketiganya tidak bisa saling menyimpang. */
    const applyBaked = async (trackId, recipes, msg) => {
        const t = tracks.find((x) => x.id === trackId);
        if (!t || !(t.origBuf || t.buf)) return flash('Pilih track dengan audio dulu');
        const orig = t.origBuf || t.buf;
        const nb = await rebake(t, recipes);
        if (!nb) return flash('Tidak ada audio untuk diproses');
        if (t.player) {
            try {
                t.player.dispose();
            } catch (e) {}
        }
        const player = new Tone.Player({ url: nb, loop: false });
        /* fxChain DIPERTAHANKAN: node Tone hidup terpisah dari Player, jadi
           edit destruktif cuma perlu disambung ulang. */
        const nt = { ...t, buf: nb, origBuf: orig, baked: recipes, player };
        reconnect(nt);
        pushHistory();
        setTracks((prev) => prev.map((x) => (x.id === trackId ? nt : x)));
        setSelected(trackId);
        setFxBarOpen(true);
        if (msg) flash(msg);
    };

    const removeBaked = async (trackId, i) => {
        try {
            const t = tracks.find((x) => x.id === trackId);
            if (!t) return;
            await applyBaked(
                trackId,
                (t.baked || []).filter((_, k) => k !== i),
                'Efek dilepas',
            );
        } catch (e) {
            flash('Gagal melepas: ' + (e && e.message ? e.message : e));
        }
    };

    const onEffectApply = async (trackId, effectId, params, fxIndex = null, bakedIndex = null) => {
        const eff = EFFECTS.find((e) => e.id === effectId);
        if (!eff) return flash('Efek tidak dikenal');
        const t = tracks.find((x) => x.id === trackId);
        if (!t) return flash('Track tidak ditemukan — tambahkan audio dulu');
        try {
            const res = await processEffect(eff, params);
            if (res && res.buffer) {
                /* destructive: catat sebagai resep, lalu render ulang dari origBuf.
                   bakedIndex != null berarti user mengedit chip yang sudah ada —
                   ganti resepnya di tempat, bukan menumpuk efek kedua. */
                const recipes = [...(t.baked || [])];
                const entry = { id: effectId, params: params || {} };
                if (bakedIndex != null && recipes[bakedIndex]) {
                    /* region ikut dipertahankan — mengedit parameter tidak boleh
                       mengubah efek region jadi efek seluruh track. */
                    if (recipes[bakedIndex].region) entry.region = recipes[bakedIndex].region;
                    recipes[bakedIndex] = entry;
                } else recipes.push(entry);
                await applyBaked(trackId, recipes, 'Efek diterapkan');
                return;
            } else if (res && res.fx) {
                /* non-destructive: fxIndex != null berarti user mengedit efek yang
                   SUDAH ada (klik chip) — ganti di tempat, jangan tumpuk duplikat. */
                const chain = [...(t.fxChain || [])];
                /* id + params disimpan bersama node: export me-render ulang efek di
                   OfflineContext (node Tone terikat ke context-nya), dan tanpa ini
                   fxChain tidak punya cukup info untuk dibangun ulang. */
                const entry = { ...res.fx, id: effectId, params };
                if (fxIndex != null && chain[fxIndex]) {
                    try {
                        chain[fxIndex].node.dispose();
                    } catch (e) {}
                    chain[fxIndex] = entry;
                } else {
                    chain.push(entry);
                }
                const nt = { ...t, fxChain: chain };
                reconnect(nt);
                pushHistory();
                setTracks((prev) => prev.map((x) => (x.id === trackId ? nt : x)));
                /* Rack hanya render kalau ada track terfokus (rackOpen = fxBarOpen
                   && selected != null). Tanpa ini, efek dari topbar masuk ke
                   fxChain tapi tidak pernah kelihatan di bottom bar. */
                setSelected(trackId);
                setFxBarOpen(true);
            } else if (res && res.playbackRate !== undefined) {
                /* Simpan di objek track — reconnect() memasangnya ulang ke setiap
                   Player baru, jadi kecepatan tidak hilang setelah edit destruktif.
                   pitchComp = semitone koreksi untuk "Preserve Pitch"; reconnect()
                   yang menyisipkan/melepas node PitchShift-nya. */
                const nt = { ...t, playbackRate: res.playbackRate, pitchComp: res.pitchComp || 0 };
                try {
                    nt.player.playbackRate = res.playbackRate;
                } catch (e) {}
                reconnect(nt);
                pushHistory();
                setTracks((prev) => prev.map((x) => (x.id === trackId ? nt : x)));
                /* Rack harus terbuka & track terfokus, sama seperti jalur efek lain —
                   kalau tidak, slot Speed cuma ada di state dan tidak pernah terlihat
                   saat efeknya dipasang dari menu topbar. */
                setSelected(trackId);
                setFxBarOpen(true);
                flash(`Playback rate ${res.playbackRate}x` + (res.pitchComp ? ' (pitch dipertahankan)' : ''));
                return;
            }
            flash('Efek diterapkan');
        } catch (e) {
            flash('Efek gagal: ' + (e && e.message ? e.message : e));
        }
    };

    const removeFx = (trackId, index) => {
        pushHistory();
        try {
            setTracks((prev) =>
                prev.map((t) => {
                    if (t.id !== trackId) return t;
                    const chain = t.fxChain || [];
                    try {
                        if (chain[index] && chain[index].node) chain[index].node.dispose();
                    } catch (e) {}
                    const nt = { ...t, fxChain: chain.filter((_, i) => i !== index) };
                    reconnect(nt);
                    return nt;
                }),
            );
            flash('Efek dilepas');
        } catch (e) {
            flash('Gagal melepas: ' + (e && e.message ? e.message : e));
        }
    };

    /* ---------- region selection (apply effect to part of a clip) ---------- */
    const clearSelection = useCallback(() => {
        setSelStart(null);
        setSelEnd(null);
        setSelTrackId(null);
    }, []);

    /* Shift+drag on a clip → set the region (clip-local seconds) */
    const handleSelectionChange = useCallback(
        (trackId, s, e2) => {
            if (e2 - s < 0.005) {
                clearSelection();
                return;
            }
            setSelTrackId(trackId);
            setSelStart(s);
            setSelEnd(e2);
        },
        [clearSelection],
    );
    /* Close the effect modal with a partial selection (used by the Selection bar). */
    const openSelectionEffectPicker = () => {
        if (selTrackId == null) return flash('Pilih bagian clip dulu (Shift+drag)');
        setModal({ type: 'effect', trackId: selTrackId, effectId: null, partial: true });
    };

    /* Bottom FX rack — buka picker efek untuk SELURUH track yang sedang dipilih. */
    const openTrackEffectPicker = (trackId) => {
        if (trackId == null) return flash('Pilih track dulu');
        setModal({ type: 'effect', trackId, effectId: null });
    };
    /* Bottom FX rack — buka modal parameter untuk satu efek yang sudah terpasang.
       fxIndex ikut dibawa supaya Apply MENGGANTI slot itu, bukan menambah duplikat. */
    const openTrackEffectEditor = (trackId, effectId, fxIndex) => {
        if (trackId == null || !effectId) return;
        const eff = EFFECTS.find((e) => e.id === effectId) || EFFECTS.find((e) => e.name === effectId);
        setModal({ type: 'effect', trackId, effectId: eff ? eff.id : effectId, fxIndex });
    };
    /* Sama untuk efek destruktif: bakedIndex dibawa supaya Apply MENGGANTI resep
       itu (audio dirender ulang dari origBuf), bukan menumpuk efek kedua. */
    const openBakedEffectEditor = (trackId, effectId, bakedIndex) => {
        if (trackId == null || !effectId) return;
        const eff = EFFECTS.find((e) => e.id === effectId) || EFFECTS.find((e) => e.name === effectId);
        setModal({ type: 'effect', trackId, effectId: eff ? eff.id : effectId, bakedIndex });
    };

    /* Nilai awal modal saat MENGEDIT efek terpasang. Dua sumber: slot fxChain
       (punya params) dan playbackRate yang hidup di objek track, bukan di chain. */
    const effectInitialParams = (m) => {
        if (!m) return undefined;
        const t = tracks.find((x) => x.id === m.trackId);
        if (!t) return undefined;
        if (m.fxIndex != null) return ((t.fxChain || [])[m.fxIndex] || {}).params;
        if (m.bakedIndex != null) return ((t.baked || [])[m.bakedIndex] || {}).params;
        if (m.effectId === 'playbackRate' && Math.abs((t.playbackRate || 1) - 1) > 1e-6) {
            return { prRate: t.playbackRate, prPreserve: !!t.pitchComp };
        }
        if (m.effectId === 'speedPitch' && Math.abs((t.playbackRate || 1) - 1) > 1e-6 && !t.pitchComp) {
            return { spRate: t.playbackRate };
        }
        return undefined;
    };

    /* Process ONLY the selected region of a clip's buffer. Uses the same
     processEffect/destructiveBuffer pipeline as the full-track path, but:
       · destructive effects (fade/reverse/invert/…) run on the sliced region
       · live fx (Gain/EQ/Delay/…) are RENDERED OFFLINE onto the region so the
         effect is baked into just that part, then spliced back. */
    const applyEffectToSelection = async (trackId, effectId, params) => {
        const eff = EFFECTS.find((e) => e.id === effectId);
        if (!eff) return flash('Efek tidak dikenal');
        const t = tracks.find((x) => x.id === trackId);
        if (!t || !t.buf) return flash('Pilih track dengan audio dulu');
        if (selTrackId !== trackId || selStart == null || selEnd == null || selEnd <= selStart) return flash('Tidak ada seleksi pada track ini');
        /* selection is clip-local (0..duration), offset handled by the splice */
        const start = Math.max(0, selStart),
            end = Math.min(t.buf.duration, selEnd);
        if (end - start < 0.01) return flash('Seleksi terlalu pendek');
        try {
            if (eff.id === 'speedPitch' || eff.id === 'playbackRate') {
                /* Kecepatan adalah properti player, bukan sampel — tidak ada artinya
                   per-region. Alihkan ke jalur seluruh track daripada menolak. */
                return onEffectApply(trackId, effectId, params);
            }
            const res = await processEffect(eff, params || {});
            if (!res || (!res.buffer && !res.fx)) return flash('Efek tidak bisa diterapkan ke seleksi');
            /* Resep region, sama seperti efek destruktif seluruh track — chip-nya
               muncul di rack dan bisa dilepas lagi. */
            await applyBaked(trackId, [...(t.baked || []), { id: effectId, params: params || {}, region: [start, end] }], `Efek diterapkan ke seleksi (${(end - start).toFixed(2)}s)`);
            clearSelection();
        } catch (e) {
            flash('Efek seleksi gagal: ' + (e && e.message ? e.message : e));
        }
    };

    /* Render a live fx onto a slice OFFLINE (bake it into the region). Uses the
     native Web Audio graph for the effect (no Tone node reuse — Tone nodes only
     run on the live context). Falls back to a pass-through gain if unsupported. */
    const renderRegionFx = async (buffer, eff, params, _toneNode) => {
        const sr = buffer.sampleRate;
        const off = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, Math.ceil(buffer.duration * sr)), sr);
        const src = off.createBufferSource();
        src.buffer = buffer;
        let tail = src;
        try {
            switch (eff.id) {
                case 'gain': {
                    const g = off.createGain();
                    g.gain.value = Math.pow(10, (params.gainDb || 0) / 20);
                    tail.connect(g);
                    tail = g;
                    break;
                }
                case 'paragraphicEQ': {
                    const freqs = [params.peq0Freq, params.peq1Freq, params.peq2Freq, params.peq3Freq];
                    const gains = [params.peq0Gain, params.peq1Gain, params.peq2Gain, params.peq3Gain];
                    freqs.forEach((f, i) => {
                        const bq = off.createBiquadFilter();
                        bq.type = 'peaking';
                        bq.frequency.value = f;
                        bq.Q.value = 1;
                        bq.gain.value = gains[i] || 0;
                        tail.connect(bq);
                        tail = bq;
                    });
                    break;
                }
                case 'graphicEQ': {
                    const freqs = logBands(10);
                    freqs.forEach((f, i) => {
                        const bq = off.createBiquadFilter();
                        bq.type = 'peaking';
                        bq.frequency.value = f;
                        bq.Q.value = 1;
                        bq.gain.value = params['g' + i] || 0;
                        tail.connect(bq);
                        tail = bq;
                    });
                    break;
                }
                case 'graphicEQ20': {
                    const freqs = logBands(20);
                    freqs.forEach((f, i) => {
                        const bq = off.createBiquadFilter();
                        bq.type = 'peaking';
                        bq.frequency.value = f;
                        bq.Q.value = 1;
                        bq.gain.value = params['g' + i] || 0;
                        tail.connect(bq);
                        tail = bq;
                    });
                    break;
                }
                case 'compressor': {
                    const c = off.createDynamicsCompressor();
                    c.threshold.value = params.cThresh || -24;
                    c.knee.value = params.cKnee || 30;
                    c.ratio.value = params.cRatio || 12;
                    c.attack.value = params.cAttack || 0.003;
                    c.release.value = params.cRelease || 0.25;
                    tail.connect(c);
                    tail = c;
                    break;
                }
                case 'hardLimiter': {
                    /* simple ceiling clamp */
                    const g = off.createGain();
                    g.gain.value = 1;
                    tail.connect(g);
                    tail = g;
                    break;
                }
                case 'delay': {
                    const delay = off.createDelay(4);
                    delay.delayTime.value = (params.dTime || 350) / 1000;
                    const fb = off.createGain();
                    fb.gain.value = (params.dFeedback || 35) / 100;
                    const wet = off.createGain();
                    wet.gain.value = (params.dMix || 30) / 100;
                    const dry = off.createGain();
                    dry.gain.value = 1 - (params.dMix || 30) / 100;
                    const split = off.createGain();
                    tail.connect(split);
                    split.connect(dry);
                    dry.connect(off.destination);
                    split.connect(delay);
                    delay.connect(fb);
                    fb.connect(delay);
                    delay.connect(wet);
                    wet.connect(off.destination);
                    return off.startRendering();
                }
                case 'distortion': {
                    const wd = off.createWaveShaper();
                    const k = ((params.disDrive || 40) / 100) * 50 + 1;
                    const curve = new Float32Array(1024);
                    for (let i = 0; i < 1024; i++) {
                        const x = (i / 1024) * 2 - 1;
                        curve[i] = Math.tanh(k * x);
                    }
                    wd.curve = curve;
                    tail.connect(wd);
                    tail = wd;
                    break;
                }
                default:
                    /* reverb / unknown live fx: bake a reverb IR convolution */
                    if (eff.id === 'reverb') {
                        const conv = off.createConvolver();
                        const irLen = Math.round(off.sampleRate * (1 + ((params.rvRoom || 45) / 100) * 5));
                        const ir = off.createBuffer(2, irLen, off.sampleRate);
                        for (let c = 0; c < 2; c++) {
                            const d = ir.getChannelData(c);
                            for (let i = 0; i < irLen; i++) {
                                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2);
                            }
                        }
                        conv.buffer = ir;
                        const wet = off.createGain();
                        wet.gain.value = (params.rvWet || 25) / 100;
                        const dry = off.createGain();
                        dry.gain.value = 1 - (params.rvWet || 25) / 100;
                        const split = off.createGain();
                        tail.connect(split);
                        split.connect(dry);
                        dry.connect(off.destination);
                        split.connect(conv);
                        conv.connect(wet);
                        wet.connect(off.destination);
                        return off.startRendering();
                    }
                    /* pass through for anything else */
                    break;
            }
        } catch (e) {}
        tail.connect(off.destination);
        src.start(0);
        return off.startRendering();
    };

    /* ---------- track ops ---------- */
    const replaceBuffer = async (trackId, file) => {
        try {
            const arrayBuf = await file.arrayBuffer();
            const buf = await makeBuffer(arrayBuf);
            pushHistory();
            setTracks((prev) =>
                prev.map((t) => {
                    if (t.id !== trackId) return t;
                    if (t.player) {
                        try {
                            t.player.dispose();
                        } catch (e) {}
                    }
                    const player = new Tone.Player({ url: buf, loop: false }).toDestination();
                    const panner = makePanner(t.pan || 0);
                    const meter = new Tone.Meter({ normalRange: false });
                    player.chain(panner, meter);
                    const nt = { ...t, buf, player, panner, meter };
                    nt.fxChain = []; // reset fx on new audio
                    reconnect(nt);
                    return nt;
                }),
            );
            flash('Audio diganti');
        } catch (e) {
            flash('Gagal: ' + (e && e.message ? e.message : e));
        }
    };

    const removeTrack = (id) => {
        pushHistory();
        setTracks((prev) => {
            const t = prev.find((x) => x.id === id);
            if (t && t.player) {
                try {
                    t.player.dispose();
                } catch (e) {}
            }
            return prev.filter((x) => x.id !== id);
        });
        if (selected === id) setSelected(null);
        flash('Track dihapus');
    };

    /* reorder tracks via drag (from index → to index) */
    const moveTrack = useCallback(
        (from, to) => {
            const n = tracks.length;
            if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
            pushHistory();
            setTracks((prev) => {
                const next = [...prev];
                const [t] = next.splice(from, 1);
                next.splice(to, 0, t);
                return next;
            });
            flash('Urutan track diubah');
        },
        [tracks.length, pushHistory],
    );

    const renameTrack = (id, name) => {
        pushHistory();
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    };

    /* reposition a clip on the timeline (drag gesture → offset in seconds).
     Live-updates during the drag; a snapshot lands in history on release. */
    const dragHistPushed = useRef(false);
    const setClipOffset = useCallback(
        (id, offset) => {
            const o = Math.max(0, +offset || 0);
            let changed = false;
            setTracks((prev) => {
                const t = prev.find((x) => x.id === id);
                const old = t?.offset || 0;
                if (!t || Math.abs(old - o) < 0.001) return prev;
                changed = true;
                const nt = { ...t, offset: o };
                reconnect(nt);
                return prev.map((x) => (x.id === id ? nt : x));
            });
            if (changed && !dragHistPushed.current) {
                dragHistPushed.current = true;
                pushHistory();
            }
        },
        [pushHistory],
    );
    // reset the flag on the NEXT drag start (mouseDown on clip), not on timeout
    const onClipDragStart = useCallback(() => {
        dragHistPushed.current = false;
    }, []);

    const setVol = (id, v) =>
        setTracks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                try {
                    t.player.volume.value = v;
                } catch (e) {}
                return { ...t, volumeDb: v };
            }),
        );
    const setPan = (id, v) =>
        setTracks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                try {
                    t.panner.pan.value = v;
                } catch (e) {}
                return { ...t, pan: v };
            }),
        );
    const toggleMute = (id) =>
        setTracks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                try {
                    t.player.mute = !t.mute;
                } catch (e) {}
                return { ...t, mute: !t.mute };
            }),
        );
    const toggleCollapse = (id) => setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, collapsed: !t.collapsed } : t)));
    const toggleSolo = (id) =>
        setTracks((prev) => {
            const nextSolo = !prev.find((x) => x.id === id).solo;
            return prev.map((t) => {
                const solo = t.id === id ? nextSolo : t.solo;
                if (t.player) {
                    if (nextSolo) {
                        /* Activating solo: mute all except the soloed track */
                        t.player.mute = t.mute || t.id !== id;
                    } else {
                        /* Deactivating solo: restore all to their individual mute states */
                        t.player.mute = t.mute;
                    }
                }
                return { ...t, solo };
            });
        });
    const toggleSnap = () => {
        setSnap((v) => !v);
        flash('Snap ' + (snap ? 'off' : 'on'));
    };
    const toggleLoop = () => {
        setLoop((v) => {
            const nv = !v;
            Tone.Transport.loop = nv;
            if (nv) {
                const dur = tracks.reduce((m, t) => Math.max(m, laneDur(t) + (t.offset || 0)), 0);
                if (dur > 0) Tone.Transport.loopEnd = dur;
            }
            return nv;
        });
        flash('Loop ' + (loop ? 'off' : 'on'));
    };
    const zeroCross = () => {
        const t = tracks.find((x) => x.id === selected);
        if (!t || !t.buf) return flash('Pilih track dengan audio dulu');
        const d = t.buf.getChannelData(0);
        const idx = Math.floor((pos || 0) * t.buf.sampleRate);
        if (idx >= d.length) return flash('Posisi di luar audio');
        let best = idx;
        for (let i = idx; i < Math.min(idx + t.buf.sampleRate / 50, d.length); i++) {
            if (Math.abs(d[i]) < Math.abs(d[best])) best = i;
        }
        Tone.Transport.seconds = best / t.buf.sampleRate;
        setPos(best / t.buf.sampleRate);
        posRef.current = best / t.buf.sampleRate;
        flash(`Zero-cross @ ${(best / t.buf.sampleRate).toFixed(3)}s`);
    };
    const channelInfo = () => {
        const t = tracks.find((x) => x.id === selected) || tracks[0];
        if (!t || !t.buf) return flash('Tidak ada track dengan audio');
        const b = t.buf;
        let peak = 0,
            sum = 0;
        for (let c = 0; c < b.numberOfChannels; c++) {
            const d = b.getChannelData(c);
            for (let i = 0; i < d.length; i++) {
                const a = Math.abs(d[i]);
                if (a > peak) peak = a;
                sum += a * a;
            }
        }
        const rms = Math.sqrt(sum / (b.length * b.numberOfChannels));
        setModal({ type: 'channel', payload: { name: t.name, ch: b.numberOfChannels, sr: b.sampleRate, dur: b.duration, peak, rms, db: 20 * Math.log10(rms || 1e-9) } });
    };
    const selectAll = () => {
        const target = (selected != null ? tracks.find((x) => x.id === selected) : null) || tracks.find((x) => x.buf);
        if (target && target.buf) {
            setSelTrackId(target.id);
            setSelStart(0);
            setSelEnd(target.buf.duration);
            setSelected(target.id);
            flash(`Seluruh audio dipilih: ${target.name} (${target.buf.duration.toFixed(2)}s)`);
        } else {
            setSelected(null);
            flash('Semua track terpilih');
        }
    };
    const deselectAll = () => {
        setSelected(null);
        clearSelection();
        flash('Seleksi dikosongkan');
    };

    /* ---------- file actions ---------- */
    const openFilePicker = () => fileInput.current && fileInput.current.click();

    const pickEffect = (effectId) => {
        /* If a clip region is currently selected, treat the topbar Effects menu
       as a SELECTION effect (partial:true → applyEffectToSelection) instead of
       a whole-track effect. This makes the "select then add effect" flow work
       from the topbar too, not just from the SelectionBar button. */
        if (selTrackId != null && selStart != null && selEnd != null && selEnd > selStart) {
            setModal({ type: 'effect', trackId: selTrackId, effectId, partial: true });
            return;
        }
        /* Pakai track yang sedang dipilih (selected) — bukan tracks[0]. Topbar
       Effects menu harus mengarah ke track yang terbuka di bottom bar, bukan
       track pertama. Kalau selected null, fallback ke track pertama. */
        const targetId = selected || (tracks.length ? tracks[0].id : null);
        setModal({ type: 'effect', trackId: targetId, effectId });
    };
    const openHelp = () => setModal({ type: 'help' });
    const openWhatsNew = () => setModal({ type: 'about' });

    const modalEffect = modal && modal.type === 'effect'
        ? EFFECTS.find((e) => e.id === modal.effectId) || EFFECTS.find((e) => e.name === modal.effectId)
        : null;

    /* ---------- keyboard shortcuts ---------- */
    useEffect(() => {
        const h = (e) => {
            /* Space toggles play/pause (unless typing in an input) */
            if (e.code === 'Space' && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) {
                e.preventDefault();
                play();
                return;
            }
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (k === 'z' && e.shiftKey) {
                e.preventDefault();
                redo();
            } else if (k === 'e') {
                e.preventDefault();
                openExport();
            } else if (k === 's') {
                e.preventDefault();
                saveDraft();
            } else if (k === 'a') {
                e.preventDefault();
                selectAll();
            } else if (k === 'm') {
                e.preventDefault();
                toggleMetronome();
            }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [play, undo, redo, openExport, saveDraft, selectAll, toggleMetronome]);

    /* ---------- VU meters ---------- */
    useEffect(() => {
        if (!vu || !tracks.length) return;
        let raf;
        const tick = () => {
            const lv = {};
            for (const t of tracks) {
                if (t.player && t.meter) {
                    try {
                        lv[t.id] = Math.max(0, (t.meter.getValue() + 60) / 60);
                    } catch (e) {}
                }
            }
            setVuLevels(lv);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [vu, tracks]);

    /* ---------- preview buffer for EffectModal ---------- */
    const previewBuffer = useCallback(async () => {
        const t = tracks.find((x) => x.id === (modal && modal.trackId));
        return t ? t.buf : null;
    }, [tracks, modal]);

    /* test hook (browser audit only) — DEV saja, jangan diekspos ke produksi */
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        window.__app = {
            tracks,
            loadFile,
            exportMix,
            onEffectApply,
            pickEffect,
            setTracks,
            loadSample,
            loadUrl,
            saveDraft,
            loadDraft,
            undo,
            redo,
            zoomIn,
            zoomOut,
            fitToWidth,
            seekTo,
            moveTrack,
            toggleSnap,
            snap,
            toggleMetronome,
            metronome,
            toggleLoop,
            loop,
            pxPerSec,
            pos,
            playing,
            getCtx: () => {
                try {
                    return Tone.getContext().state;
                } catch (e) {
                    return 'err:' + (e.message || e);
                }
            },
            transportSeconds: () => {
                try {
                    return Tone.Transport.seconds;
                } catch (e) {
                    return -1;
                }
            },
            getState: () =>
                tracks.map((t) => ({
                    id: t.id,
                    name: t.name,
                    fx: (t.fxChain || []).map((f) => f.type),
                    /* resep destruktif + rate: dipakai audit browser untuk membuktikan
                       chip rack = state sebenarnya, dan lane memendek sesuai rate. */
                    baked: (t.baked || []).map((r) => ({ id: r.id, params: r.params || {}, region: r.region || null })),
                    playbackRate: t.playbackRate || 1,
                    pitchComp: t.pitchComp || 0,
                    hasBuf: !!t.buf,
                    offset: t.offset || 0,
                    dur: t.buf ? t.buf.duration : 0,
                    origDur: t.origBuf ? t.origBuf.duration : t.buf ? t.buf.duration : 0,
                    laneDur: laneDur(t),
                })),
            /* seleksi region — dipakai audit browser untuk mengukur RMS in/out region */
            selStart,
            selEnd,
            selTrackId,
            setClipOffset,
        };
    });

    /* Ruang yang harus dikosongkan di bawah .app agar statusbar tidak tertutup bar
     mengapung: fx rack (104px) dan/atau selection bar (48px). Keduanya bisa aktif
     bersamaan — selection bar naik ke atas rack. */
    const hasSel = selStart != null && selEnd != null && selEnd > selStart;
    const rackOpen = fxBarOpen && selected != null;
    /* Angka ini HARUS sama dengan --fxbar-h di index.css (116px: chip fx rack kini
       dua baris — nama + keterangan parameter). Kalau salah satu berubah tanpa yang
       lain, statusbar ketutup atau ada celah kosong di bawah. */
    const reserveBottom = (rackOpen ? 116 : 0) + (hasSel ? (rackOpen ? 54 : 48) : 0);

    /* --reserve-bottom = ruang bar mengapung di bawah (fx rack + selection bar).
     .app dipendekkan sebanyak ini supaya statusbar tidak pernah tertutup. */
    return (
        <div className={'app' + (fxBarOpen && selected != null ? ' fx-bar-open' : '')} style={{ '--reserve-bottom': reserveBottom + 'px' }}>
            <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) loadFile(f);
                    e.target.value = '';
                }}
            />
            <Topbar
                tracks={tracks}
                playing={playing}
                bpm={bpm}
                pos={pos}
                setBpm={(v) => {
                    setBpm(v);
                    try {
                        Tone.Transport.bpm.value = v;
                    } catch (e) {}
                }}
                onPlay={play}
                onStop={stop}
                onPickEffect={pickEffect}
                onExport={openExport}
                onLoadComputer={openFilePicker}
                onLoadSample={loadSample}
                onLoadUrl={() => setModal({ type: 'url' })}
                onRecord={recording ? stopRecording : startRecording}
                recording={recording}
                onSaveDraft={saveDraft}
                onLoadDraft={loadDraft}
                onUndo={undo}
                onRedo={redo}
                onSelectAll={selectAll}
                onDeselect={deselectAll}
                onChannelInfo={channelInfo}
                onLoop={toggleLoop}
                loop={loop}
                onZeroCross={zeroCross}
                onSnap={toggleSnap}
                snap={snap}
                onMetronome={toggleMetronome}
                metronome={metronome}
                onWaveColors={() => setWaveColors((v) => !v)}
                onVuMeters={() => setVu((v) => !v)}
                onCompact={() => setCompact((v) => !v)}
                waveColors={waveColors}
                vu={vu}
                compact={compact}
                onShortcuts={openHelp}
                onWhatsNew={openWhatsNew}
            />

            {toast && (
                <div className="toast show">
                    <span className="tdot" />
                    {toast}
                </div>
            )}

            <main className="tracks-area" ref={timelineRef}>
                {tracks.length === 0 && (
                    <div
                        className="drop-zone big"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const f = e.dataTransfer.files[0];
                            if (f && f.type.startsWith('audio/')) loadFile(f);
                        }}
                    >
                        <div className="empty-cta">
                            <div className="empty-icon">+</div>
                            <div>Drop audio file di sini untuk menambah track</div>
                            <div className="hint">atau</div>
                            <button className="btn primary empty-btn" onClick={openFilePicker}>
                                Pilih File Musik
                            </button>
                        </div>
                    </div>
                )}
                {tracks.length > 0 && (
                    <div className="timeline-container">
                        {/* fixed channel strips column */}
                        <div className="channel-column" style={{ width: channelW }}>
                            {/* sidebar header: + Add Track · automation · undo/redo */}
                            <div className="channel-head">
                                <button className="ch-add" onClick={addTrack} title="Tambah track kosong">
                                    + <span>Add Track</span>
                                </button>
                                <span className="ch-head-spacer" />
                                <button className="ch-icon" title="Automation" onClick={() => flash('Automation: belum tersedia')}>
                                    ∿
                                </button>
                                <button className="ch-icon" title="Undo" onClick={undo}>
                                    ↶
                                </button>
                                <button className="ch-icon" title="Redo" onClick={redo}>
                                    ↷
                                </button>
                            </div>
                            {/* daftar strip: scroll vertikalnya di-mirror dari .timeline-scroll.
                  margin-bottom = baris scrollbar (--sbar-h) + tinggi scrollbar
                  horizontal native, supaya kotak sidebar berakhir tepat di batas
                  bawah area lane yang benar-benar terlihat. */}
                            <div
                                className="channel-strips"
                                ref={channelColRef}
                                style={{ marginBottom: `calc(var(--sbar-h) + ${hbarH}px)` }}
                                onWheel={(e) => {
                                    /* sidebar tidak punya scroll sendiri — teruskan wheel ke timeline
                       (vertikal kalau ada ruang, kalau tidak: geser mendatar) */
                                    const el = scrollRef.current;
                                    if (!el) return;
                                    const plan = wheelPlan(e, el);
                                    if (plan.kind === 'x') {
                                        followRef.current = false;
                                        scrollTo(plan.next);
                                        return;
                                    }
                                    el.scrollTop += e.deltaY;
                                    if (channelInnerRef.current) channelInnerRef.current.style.transform = 'translateY(' + -el.scrollTop + 'px)';
                                }}
                            >
                                <div className="channel-strips-inner" ref={channelInnerRef}>
                                    {tracks.map((t, i) => (
                                        <ChannelStrip
                                            key={t.id}
                                            t={t}
                                            index={i}
                                            total={tracks.length}
                                            selected={selected === t.id}
                                            compact={compact}
                                            vu={vu}
                                            vuLevel={vuLevels[t.id] || 0}
                                            onSelect={() => focusTrack(t.id)}
                                            onMute={() => toggleMute(t.id)}
                                            onSolo={() => toggleSolo(t.id)}
                                            onRemove={() => removeTrack(t.id)}
                                            onRename={(n) => renameTrack(t.id, n)}
                                            onVol={(v) => setVol(t.id, v)}
                                            onPan={(v) => setPan(t.id, v)}
                                            onReplace={(f) => replaceBuffer(t.id, f)}
                                            onEffects={() => setModal({ type: 'effect', trackId: t.id, effectId: null })}
                                            onRemoveFx={(i) => removeFx(t.id, i)}
                                            onCollapse={() => toggleCollapse(t.id)}
                                            onMoveTrack={moveTrack}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* scrollable timeline column */}
                        <div className="timeline-column">
                            <div
                                className="timeline-scroll"
                                ref={scrollRef}
                                style={{ overflowX: 'auto', overflowY: 'auto' }}
                                onScroll={(e) => {
                                    /* update the range input imperatively — no React state on the scroll path */
                                    if (rangeRef.current) rangeRef.current.value = String(e.target.scrollLeft);
                                    /* scroll yang BUKAN dari scrollTo() = user menggeser sendiri → matikan
                     auto-follow supaya playhead tidak menariknya balik saat play */
                                    if (Math.abs(e.target.scrollLeft - selfScrollRef.current) > 1) followRef.current = false;
                                    /* mirror vertical scroll ke sidebar via transform (bukan scrollTop) —
                     sidebar tidak punya scrollbar sendiri, jadi jangkauannya selalu pas */
                                    if (channelInnerRef.current) channelInnerRef.current.style.transform = 'translateY(' + -e.target.scrollTop + 'px)';
                                }}
                            >
                                <div className="timeline-content" style={{ width: contentWidth, minWidth: contentWidth }}>
                                    <Ruler width={contentWidth} pxPerSec={pxPerSec} onSeek={seekFromClick} />
                                    {tracks.map((t) => (
                                        <TrackLane
                                            key={t.id}
                                            t={t}
                                            width={contentWidth}
                                            pxPerSec={pxPerSec}
                                            waveColors={waveColors}
                                            compact={compact}
                                            selected={selected === t.id}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const f = e.dataTransfer.files[0];
                                                if (f && f.type.startsWith('audio/')) replaceBuffer(t.id, f);
                                            }}
                                            onWaveClick={() => focusTrack(t.id, { scroll: false })}
                                            onSeek={seekFromClick}
                                            snap={snap}
                                            snapRef={snapRef}
                                            bpm={bpm}
                                            onOffsetChange={setClipOffset}
                                            onClipDragStart={onClipDragStart}
                                            selStart={selStart}
                                            selEnd={selEnd}
                                            selTrackId={selTrackId}
                                            onSelectionChange={handleSelectionChange}
                                        />
                                    ))}
                                    <div className="playhead" ref={playheadRef}></div>
                                </div>
                            </div>
                            {/* shared horizontal scrollbar */}
                            <div className="timeline-scrollbar">
                                <div className="scroll-zoom-group">
                                    <button className="sc-zoom" onClick={zoomOut} title="Zoom out">
                                        −
                                    </button>
                                    <span className="sc-zoom-label">{pxPerSec}px/s</span>
                                    <button className="sc-zoom" onClick={zoomIn} title="Zoom in">
                                        +
                                    </button>
                                    <button className="sc-fit" onClick={() => fitToWidth()} title="Tampilkan seluruh waveform">
                                        Fit
                                    </button>
                                </div>
                                <input
                                    type="range"
                                    className="timeline-range"
                                    ref={rangeRef}
                                    min={0}
                                    max={Math.max(0, contentWidth - (viewW - channelW)) || 0}
                                    defaultValue={0}
                                    onInput={(e) => {
                                        const el = scrollRef.current;
                                        const v = +e.target.value;
                                        if (el) el.scrollLeft = v;
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* bottom fx rack: per-track effect chain — muncul saat track dipilih.
          Terpisah dari SelectionBar (floating) sesuai preferensi user. */}
            {fxBarOpen && selected != null && tracks.some((t) => t.id === selected) && (
                <BottomFxBar
                    track={tracks.find((t) => t.id === selected)}
                    hasSelection={selTrackId === selected && selStart != null && selEnd != null && selEnd > selStart}
                    selStart={selStart}
                    selEnd={selEnd}
                    onAddEffect={() => openTrackEffectPicker(selected)}
                    onAddToSelection={openSelectionEffectPicker}
                    onRemoveFx={(i) => removeFx(selected, i)}
                    onEditFx={(effectId, fxIndex) => openTrackEffectEditor(selected, effectId, fxIndex)}
                    onEditBaked={(effectId, bakedIndex) => openBakedEffectEditor(selected, effectId, bakedIndex)}
                    onRemoveBaked={(i) => removeBaked(selected, i)}
                    onEditRate={() => openTrackEffectEditor(selected, 'playbackRate')}
                    onRemoveRate={() => onEffectApply(selected, 'playbackRate', { prRate: 1, prPreserve: false })}
                    onClose={() => setFxBarOpen(false)}
                />
            )}

            {modal && modal.type === 'effect' && modalEffect && (
                <EffectModal
                    key={modal.trackId + ':' + modal.effectId + ':' + (modal.fxIndex ?? 'n') + ':' + (modal.bakedIndex ?? 'n')}
                    effect={modalEffect}
                    initialParams={effectInitialParams(modal)}
                    onClose={() => setModal(null)}
                    onApply={(params) => (modal.partial ? applyEffectToSelection(modal.trackId ?? null, modal.effectId, params) : onEffectApply(modal.trackId ?? null, modal.effectId, params, modal.fxIndex ?? null, modal.bakedIndex ?? null))}
                    previewBuffer={previewBuffer}
                />
            )}
            {/* selection bar: shown while a clip region is selected */}
            {selStart != null && selEnd != null && selEnd > selStart && (
                <SelectionBar
                    start={selStart}
                    end={selEnd}
                    trackName={(() => {
                        const t = tracks.find((x) => x.id === selTrackId);
                        return t ? t.name : '';
                    })()}
                    onApplyEffect={openSelectionEffectPicker}
                    onClear={clearSelection}
                    aboveFx={fxBarOpen && selected != null && tracks.some((t) => t.id === selected)}
                />
            )}
            {modal && modal.type === 'export' && <ExportModal trackCount={tracks.length} duration={Math.max(...tracks.map((t) => laneDur(t) + (t.offset || 0)), 0)} onClose={() => setModal(null)} onExport={exportMix} />}
            {modal && modal.type === 'help' && (
                <Modal title="Keyboard Shortcuts" onClose={() => setModal(null)}>
                    <pre className="help-pre">{HELP_SNIPPET}</pre>
                </Modal>
            )}
            {modal && modal.type === 'about' && (
                <Modal title="What's New" onClose={() => setModal(null)}>
                    <div className="about-body">
                        <div className="about-title">Mixing Audio v1.0</div>
                        <ul className="about-list">
                            <li>19 efek audio fungsional (Dynamics, EQ, Time-based, Restoration, Pitch, Utility)</li>
                            <li>Undo / Redo + draft lokal (IndexedDB — audio ikut tersimpan)</li>
                            <li>Rekaman mikrofon, load dari URL / sample</li>
                            <li>Export mix ke WAV / MP3 / FLAC</li>
                        </ul>
                    </div>
                </Modal>
            )}
            {modal && modal.type === 'channel' && modal.payload && (
                <Modal title="Channel Info" onClose={() => setModal(null)}>
                    <div className="channel-grid">
                        <div>
                            <span>Nama</span>
                            <b>{modal.payload.name}</b>
                        </div>
                        <div>
                            <span>Channel</span>
                            <b>{modal.payload.ch}</b>
                        </div>
                        <div>
                            <span>Sample Rate</span>
                            <b>{modal.payload.sr} Hz</b>
                        </div>
                        <div>
                            <span>Durasi</span>
                            <b>{modal.payload.dur.toFixed(2)} s</b>
                        </div>
                        <div>
                            <span>Peak</span>
                            <b>{modal.payload.peak.toFixed(3)}</b>
                        </div>
                        <div>
                            <span>RMS</span>
                            <b>{modal.payload.rms.toFixed(4)}</b>
                        </div>
                        <div>
                            <span>Level</span>
                            <b>{modal.payload.db.toFixed(1)} dB</b>
                        </div>
                    </div>
                </Modal>
            )}
            {modal && modal.type === 'url' && (
                <Modal title="Load from URL" onClose={() => setModal(null)}>
                    <input
                        className="url-input"
                        type="text"
                        placeholder="https://example.com/audio.mp3"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const v = e.target.value.trim();
                                if (v) {
                                    loadUrl(v);
                                    setModal(null);
                                }
                            }
                        }}
                    />
                    <div className="url-hint">Tempel URL file audio lalu tekan Enter</div>
                </Modal>
            )}
            {modal && modal.type === 'draft' && modal.payload && (
                <Modal title="Open Local Drafts" onClose={() => setModal(null)}>
                    {modal.payload.map((d) => (
                        <div className="draft-row" key={d.key} onClick={() => applyDraft(d)}>
                            <span>{d.key.replace('kael-draft-', '')}</span>
                            <span className="draft-meta">
                                {d.tracks.length} track · {d.bpm} BPM
                            </span>
                        </div>
                    ))}
                    {!modal.payload.length && <div className="draft-empty">Belum ada draft</div>}
                </Modal>
            )}
            {modal && modal.type === 'effect' && !modalEffect && (
                <Modal title="Pilih Efek" onClose={() => setModal(null)}>
                    <div className="effect-picker">
                        {EFFECTS.map((e) => (
                            <div
                                className="fx-pick-row"
                                key={e.id}
                                onClick={() => {
                                    setModal({ type: 'effect', trackId: modal.trackId || (tracks[0] && tracks[0].id), effectId: e.id, partial: modal.partial });
                                }}
                            >
                                <span>{e.name}</span>
                                <span className="fx-pick-group">{e.group}</span>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            <div className="statusbar">
                <span>Position {(pos || 0).toFixed(2)}s</span>
                <span>BPM {bpm}</span>
                <span>Tracks {tracks.length}</span>
                <span>{snap ? 'Snap on' : 'Snap off'}</span>
                <span>{loop ? 'Loop on' : 'Loop off'}</span>
                <span style={{marginLeft:'auto'}}>&copy; 2026 by Mikhael. All rights reserved.</span>
            </div>
        </div>
    );
}

/* ---------- helpers ---------- */
const TRACK_COLORS = ['#4ed9c0', '#9d8cf2', '#f2b84b', '#f2665e', '#6ab7ff', '#f28cd0'];
function trackColor(i) {
    return TRACK_COLORS[i % TRACK_COLORS.length];
}

/* Rebuild a default Tone node for an effect by name (used by undo restore). */
function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
