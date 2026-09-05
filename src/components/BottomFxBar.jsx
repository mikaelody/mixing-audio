import React from 'react';
import { EFFECTS_BY_NAME, EFFECTS_BY_ID, fxSummary, fxDetail } from '../audio/effectsConfig.js';

/* Bottom FX bar — per-track effect rack.
   Muncul saat sebuah track dipilih. Menampilkan SEMUA efek yang terpasang di
   track itu, dari ketiga sumber yang berbeda:
     - rate   : playbackRate (properti player, bukan node)
     - fx     : fxChain (node Tone realtime)
     - baked  : resep destruktif yang menulis ke sampel (track.baked)
   Ketiganya punya keterangan parameter, bisa diklik untuk diedit, dan bisa
   dilepas. Terpisah dari SelectionBar (floating) sesuai preferensi user. */
export default function BottomFxBar({ track, hasSelection, selStart, selEnd, onAddEffect, onAddToSelection, onRemoveFx, onEditFx, onEditRate, onRemoveRate, onEditBaked, onRemoveBaked, onClose }) {
    if (!track) return null;

    const chain = track.fxChain || [];
    const baked = track.baked || [];
    /* Speed/Playback Rate bukan node di fxChain (ia properti player), tapi user
       tetap "menambahkan efek" — jadi ia harus tampil sebagai slot supaya bisa
       diedit atau dihapus seperti efek lain. */
    const rate = track.playbackRate || 1;
    const hasRate = Math.abs(rate - 1) > 1e-6;
    const total = chain.length + baked.length + (hasRate ? 1 : 0);
    const fmt = (s) => (s == null ? '0.00' : s.toFixed(2));

    /* satu bentuk slot untuk ketiga sumber — biar tidak ada jalur yang lupa
       menampilkan keterangan atau tombol hapus. */
    const Slot = ({ idx, name, note, title, onEdit, onRemove, removeTitle }) => (
        <div className="fx-slot" title={title}>
            <span className="fx-slot-idx">{idx}</span>
            <span className="fx-slot-main" onClick={onEdit} title="Klik untuk edit parameter">
                <span className="fx-slot-name">{name}</span>
                {note ? <span className="fx-slot-note">{note}</span> : null}
            </span>
            <button className="fx-slot-x" onClick={onRemove} title={removeTitle || 'Hapus efek ini'}>
                ✕
            </button>
        </div>
    );

    return (
        <div className="fx-bar">
            <div className="fx-bar-head">
                <span className="fx-bar-dot" />
                <span className="fx-bar-title">{track.name}</span>
                <span className="fx-bar-count">{total} efek</span>
                {hasSelection && (
                    <span className="fx-bar-sel">
                        seleksi {fmt(selStart)}s – {fmt(selEnd)}s
                    </span>
                )}
                <div className="fx-bar-spacer" />
                <button className="fx-bar-x" onClick={onClose} title="Tutup rack">
                    ✕
                </button>
            </div>

            <div className="fx-bar-body">
                <div className="fx-rack">
                    {total === 0 && <span className="fx-rack-empty">Belum ada efek di track ini — tambahkan lewat tombol di kanan.</span>}

                    {hasRate && (
                        <Slot
                            idx="R"
                            name="Speed"
                            note={`${rate.toFixed(2)}x${track.pitchComp ? ' · pitch asli' : ''}`}
                            title={`Speed / Playback Rate — ${rate.toFixed(2)}x${track.pitchComp ? ' (pitch dipertahankan)' : ''}`}
                            onEdit={() => onEditRate && onEditRate()}
                            onRemove={() => onRemoveRate && onRemoveRate()}
                            removeTitle="Kembalikan kecepatan ke 1.00x"
                        />
                    )}

                    {baked.map((r, i) => {
                        const meta = EFFECTS_BY_ID[r.id] || null;
                        const note = meta ? fxSummary(meta, r.params) : 'Custom';
                        const region = r.region ? ` ${r.region[0].toFixed(2)}–${r.region[1].toFixed(2)}s` : '';
                        return (
                            <Slot
                                key={'b' + i}
                                idx={'B' + (i + 1)}
                                name={meta ? meta.name : r.id}
                                note={note + region}
                                title={[meta ? meta.name : r.id, note, fxDetail(meta, r.params), region ? 'region' + region : 'seluruh track', 'ditulis ke sampel'].filter(Boolean).join(' — ')}
                                onEdit={() => onEditBaked && onEditBaked(r.id, i)}
                                onRemove={() => onRemoveBaked && onRemoveBaked(i)}
                                removeTitle="Lepas efek ini (audio dirender ulang dari aslinya)"
                            />
                        );
                    })}

                    {chain.map((fx, i) => {
                        /* fx.id ada sejak efek disimpan dengan params; fx.type (nama
                           tampilan) tetap didukung untuk chain lama dari draft/undo. */
                        const meta = (fx.id && EFFECTS_BY_ID[fx.id]) || EFFECTS_BY_NAME[fx.type] || null;
                        const note = meta ? fxSummary(meta, fx.params) : 'Custom';
                        return (
                            <Slot
                                key={'f' + i}
                                idx={i + 1}
                                name={meta ? meta.name : fx.type}
                                note={note}
                                title={[meta ? meta.name : fx.type, note, fxDetail(meta, fx.params)].filter(Boolean).join(' — ')}
                                onEdit={() => onEditFx && onEditFx(meta ? meta.id : fx.type, i)}
                                onRemove={() => onRemoveFx(i)}
                            />
                        );
                    })}
                </div>

                <div className="fx-bar-actions">
                    <button className="fx-bar-btn" onClick={onAddEffect}>
                        + Efek ke Track
                    </button>
                    <button className="fx-bar-btn primary" onClick={onAddToSelection} disabled={!hasSelection} title={hasSelection ? 'Bake efek hanya ke region terpilih' : 'Shift+drag di waveform untuk memilih region dulu'}>
                        + Efek ke Seleksi
                    </button>
                </div>
            </div>
        </div>
    );
}
