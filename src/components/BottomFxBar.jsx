import React from 'react';
import { EFFECTS_BY_ID } from '../audio/effectsConfig.js';

/* Bottom FX bar — per-track effect rack.
   Muncul saat sebuah track dipilih. Menampilkan seluruh efek yang sudah
   terpasang di track itu (fxChain), bisa hapus per efek atau tambah efek baru.
   Terpisah dari SelectionBar (floating) sesuai preferensi user. */
export default function BottomFxBar({ track, hasSelection, selStart, selEnd, onAddEffect, onAddToSelection, onRemoveFx, onEditFx, onClose }) {
    if (!track) return null;

    const chain = track.fxChain || [];
    const fmt = (s) => {
        if (s == null) return '0.00';
        return s.toFixed(2);
    };

    return (
        <div className="fx-bar">
            <div className="fx-bar-head">
                <span className="fx-bar-dot" />
                <span className="fx-bar-title">{track.name}</span>
                <span className="fx-bar-count">
                    {chain.length} {chain.length === 1 ? 'efek' : 'efek'}
                </span>
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
                    {chain.length === 0 && <span className="fx-rack-empty">Belum ada efek di track ini — tambahkan lewat tombol di kanan.</span>}
                    {chain.map((fx, i) => {
                        const meta = EFFECTS_BY_ID[fx.type] || null;
                        return (
                            <div key={i} className="fx-slot" title={meta ? meta.name : fx.type}>
                                <span className="fx-slot-idx">{i + 1}</span>
                                <span className="fx-slot-name" onClick={() => onEditFx && onEditFx(fx.type)}>
                                    {meta ? meta.name : fx.type}
                                </span>
                                <button className="fx-slot-x" onClick={() => onRemoveFx(i)} title="Hapus efek ini">
                                    ✕
                                </button>
                            </div>
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
