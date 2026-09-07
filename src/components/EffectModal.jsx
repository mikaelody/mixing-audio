import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { EFFECTS_BY_ID, EQ_PRESETS_10, EQ_PRESETS_20, matchPreset, matchEqPreset } from '../audio/effectsConfig';
import HSlider from './controls/HSlider';
import ToggleSwitch from './controls/ToggleSwitch';
import FieldSelect from './controls/FieldSelect';
import { EqBandGrid } from './controls/EqBandGrid';
import Modal from './Modal';
import { processEffect } from '../audio/applyEffect';

/* Effect configuration popup.
   Props: effect (EFFECTS_BY_ID entry), onApply(params), onClose, previewBuffer() -> AudioBuffer|null,
   initialParams (nilai tersimpan saat mengedit efek yang sudah terpasang) */
export default function EffectModal({ effect, onApply, onDelete, onClose, previewBuffer, initialParams }) {
    const eff = effect;
    const [params, setParams] = useState(() => {
        const p = {};
        (eff.fields || []).forEach((f) => {
            if (f.def !== undefined) p[f.id] = f.def;
        });
        /* Klik chip di fx rack = edit: mulai dari nilai yang benar-benar dipakai,
           bukan default — kalau tidak, Apply diam-diam mereset parameter user. */
        return initialParams ? { ...p, ...initialParams } : p;
    });
    const setP = (id, v) => setParams((prev) => ({ ...prev, [id]: v }));

    const bandCount = eff.bands ? eff.bands.length : 0;
    /* Band EQ hidup di state terpisah dari `params`, jadi ia juga harus dipulihkan
       dari initialParams — kalau tidak, mengedit EQ terpasang mereset semua band ke 0. */
    const [eqBands, setEqBands] = useState(() =>
        Array.from({ length: bandCount }, (_, i) => (initialParams && initialParams['g' + i] !== undefined ? initialParams['g' + i] : 0)),
    );

    const [preview, setPreview] = useState(false);
    const [previewReady, setPreviewReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const previewRef = useRef(null); // { player, fx } | null

    /* rebuild preview chain when preview is on and params change */
    useEffect(() => {
        if (!preview) return;
        let dead = false;
        setBusy(true);
        setErr(null);
        (async () => {
            try {
                const buf = previewBuffer ? await previewBuffer() : null;
                if (dead || !buf) return;
                const res = await processEffect(eff, { ...params, ...(bandCount ? Object.fromEntries(eqBands.map((v, i) => ['g' + i, v])) : {}) });
                if (dead) return;
                const player = new Tone.Player({ url: buf, loop: false }).toDestination();
                let tail = player;
                if (res && res.fx && res.fx.node) {
                    player.connect(res.fx.node);
                    tail = res.fx.node;
                }
                tail.connect(Tone.Destination);
                if (previewRef.current) {
                    try {
                        previewRef.current.player.dispose();
                    } catch (e) {}
                    if (previewRef.current.fx) {
                        try {
                            previewRef.current.fx.node.dispose();
                        } catch (e) {}
                    }
                }
                previewRef.current = { player, fx: res && res.fx ? res.fx : null };
                player.start(0);
                setPreviewReady(true);
            } catch (e) {
                setErr('Preview gagal: ' + (e && e.message ? e.message : e));
            } finally {
                if (!dead) setBusy(false);
            }
        })();
        return () => {
            dead = true;
        };
    }, [preview, params, eqBands, eff, previewBuffer]);

    /* stop preview on unmount */
    useEffect(
        () => () => {
            if (previewRef.current) {
                try {
                    previewRef.current.player.stop();
                    previewRef.current.player.dispose();
                } catch (e) {}
                if (previewRef.current.fx) {
                    try {
                        previewRef.current.fx.node.dispose();
                    } catch (e) {}
                }
            }
        },
        [],
    );

    const apply = () => {
        if (previewRef.current) {
            try {
                previewRef.current.player.stop();
            } catch (e) {}
        }
        const p = bandCount ? { ...params, ...Object.fromEntries(eqBands.map((v, i) => ['g' + i, v])) } : { ...params };
        onApply(p);
        onClose();
    };

    const handleDelete = onDelete
        ? () => {
              if (previewRef.current) {
                  try {
                      previewRef.current.player.stop();
                  } catch (e) {}
              }
              onDelete();
              onClose();
          }
        : null;

    return (
        <Modal title={eff.name} onApply={apply} onDelete={handleDelete} onClose={onClose} wide={eff.wide}>
            {eff.desc && <div className="modal-desc">{eff.desc}</div>}

            <div className="modal-toolbar">
                <div className={`preview-toggle${preview ? '' : ' off'}`} onClick={() => setPreview((v) => !v)}>
                    <span className="preview-dot" />
                    Preview
                    <span className="preview-state">{preview ? (busy ? '…' : previewReady ? 'ON' : 'ERR') : 'OFF'}</span>
                </div>
                {eff.presets && (
                    <div className="preset-row">
                        <span>Presets</span>
                        <select
                            className="preset-select"
                            /* Controlled: saat mengedit efek terpasang, dropdown menunjukkan preset
                               yang sedang dipakai; begitu slider digeser ia jatuh ke "Custom". */
                            value={matchPreset(eff, params)}
                            onChange={(e) => {
                                const pr = eff.presets[e.target.value];
                                if (pr) setParams((prev) => ({ ...prev, ...pr }));
                            }}
                        >
                            <option value="">Custom</option>
                            {Object.keys(eff.presets).map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                {(eff.custom === 'graphicEQ' || eff.custom === 'graphicEQ20') && (
                    <div className="preset-row">
                        <span>EQ Presets</span>
                        <select
                            className="preset-select"
                            value={matchEqPreset(eff, eqBands)}
                            onChange={(e) => {
                                const name = e.target.value;
                                const table = eff.custom === 'graphicEQ' ? EQ_PRESETS_10 : EQ_PRESETS_20;
                                const vals = table[name];
                                if (vals) {
                                    setEqBands([...vals]);
                                    /* also push the gains into params so preset + manual tweak + apply keep working */
                                    setParams((prev) => ({ ...prev, ...Object.fromEntries(vals.map((v, i) => ['g' + i, v])) }));
                                }
                            }}
                        >
                            <option value="">Flat</option>
                            {Object.keys(eff.custom === 'graphicEQ' ? EQ_PRESETS_10 : EQ_PRESETS_20).map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
            {err && <div className="modal-err">{err}</div>}

            {eff.custom === 'graphicEQ' ? (
                <EqBandGrid
                    bands={eff.bands}
                    values={eqBands}
                    onChange={(i, v) => {
                        const n = [...eqBands];
                        n[i] = v;
                        setEqBands(n);
                    }}
                />
            ) : eff.custom === 'graphicEQ20' ? (
                <EqBandGrid
                    bands={eff.bands}
                    values={eqBands}
                    small
                    onChange={(i, v) => {
                        const n = [...eqBands];
                        n[i] = v;
                        setEqBands(n);
                    }}
                />
            ) : eff.custom === 'paragraphic' ? (
                <>
                    {['Band 1 — Low', 'Band 2 — Low Mid', 'Band 3 — High Mid', 'Band 4 — High'].map((name, i) => (
                        <div className="band-group" key={i}>
                            <div className="band-group-title">{name}</div>
                            <HSlider label={`Freq ${i + 1}`} value={params['peq' + i + 'Freq'] ?? 100} min={20} max={20000} step={10} unit=" Hz" onChange={(v) => setP('peq' + i + 'Freq', v)} />
                            <HSlider label={`Gain ${i + 1}`} value={params['peq' + i + 'Gain'] ?? 0} min={-15} max={15} step={0.5} unit=" dB" onChange={(v) => setP('peq' + i + 'Gain', v)} />
                            <HSlider label={`Q ${i + 1}`} value={params['peq' + i + 'Q'] ?? 1} min={0.1} max={10} step={0.1} onChange={(v) => setP('peq' + i + 'Q', v)} />
                        </div>
                    ))}
                </>
            ) : (
                (eff.fields || []).map((f, i) => {
                    if (f.type === 'h') return <HSlider key={i} label={f.label} value={params[f.id] ?? f.def} min={f.min} max={f.max} step={f.step} unit={f.unit} onChange={(v) => setP(f.id, v)} />;
                    if (f.type === 'hro') return <HSlider key={i} label={f.label} value={f.def} min={0} max={48} unit={f.unit} readonly />;
                    if (f.type === 'dd') return <FieldSelect key={i} label={f.label} options={f.options} value={params[f.id] ?? f.options[0]} onChange={(v) => setP(f.id, v)} />;
                    if (f.type === 'tg') return <ToggleSwitch key={i} label={f.label} sub={f.sub} value={params[f.id] ?? f.def} onChange={(v) => setP(f.id, v)} />;
                    if (f.type === 'act')
                        return (
                            <div key={i} className="h-row">
                                <div className="action-btn" onClick={() => setErr('Gunakan Noise Reduction: atur Sensitivity & Reduction Amount')}>
                                    {f.label}
                                </div>
                                <div className="action-sub">{f.sub}</div>
                            </div>
                        );
                    return null;
                })
            )}
        </Modal>
    );
}
