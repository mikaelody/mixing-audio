import React, { useState } from 'react';
import FileMenu from '../menus/FileMenu.jsx';
import EditMenu from '../menus/EditMenu.jsx';
import EffectsMenu from '../menus/EffectsMenu.jsx';
import ViewMenu from '../menus/ViewMenu.jsx';
import HelpMenu from '../menus/HelpMenu.jsx';

/* Topbar: brand + File/Edit/Effects/View/Help menus + transport (play/stop, BPM, time).
   All handlers come from App — no placeholder stubs here. */
export default function Topbar({
    tracks,
    playing,
    bpm,
    setBpm,
    pos = 0,
    onPlay,
    onStop,
    onPickEffect,
    onExport,
    onLoadComputer,
    onLoadSample,
    onLoadUrl,
    onRecord,
    recording,
    onSaveDraft,
    onLoadDraft,
    onUndo,
    onRedo,
    onSelectAll,
    onDeselect,
    onChannelInfo,
    onLoop,
    loop,
    onZeroCross,
    onSnap,
    snap,
    onMetronome,
    metronome,
    onWaveColors,
    waveColors,
    onVuMeters,
    vu,
    onCompact,
    compact,
    onShortcuts,
    onWhatsNew,
}) {
    const [openMenu, setOpenMenu] = useState(null);

    const fmt = (s) => {
        s = Math.max(0, Math.floor(s || 0));
        const m = Math.floor(s / 60),
            r = s % 60;
        return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    };

    const fileHandlers = { onExport, onLoadComputer, onLoadSample, onLoadUrl, onRecord, recording, onSaveDraft, onLoadDraft };
    const editHandlers = { onUndo, onRedo, onSelectAll, onDeselect, onChannelInfo, onLoop, onZeroCross, loop, onSnap, snap, onMetronome, metronome };
    const viewHandlers = { onWaveColors, onVuMeters, onCompact };
    const helpHandlers = { onShortcuts, onWhatsNew };

    return (
        <header className="menubar">
            <div className="menubar-left">
                <div className="brand">
                    <span className="brand-dot" />
                    Mixing Audio
                </div>
                <nav className="menu-items">
                    <FileMenu handlers={fileHandlers} openMenu={openMenu} setOpenMenu={setOpenMenu} />
                    <EditMenu handlers={editHandlers} openMenu={openMenu} setOpenMenu={setOpenMenu} />
                    <EffectsMenu onPick={onPickEffect} openMenu={openMenu} setOpenMenu={setOpenMenu} />
                    <ViewMenu handlers={viewHandlers} openMenu={openMenu} setOpenMenu={setOpenMenu} prefs={{ waveColors, vu, compact }} />
                    <HelpMenu handlers={helpHandlers} openMenu={openMenu} setOpenMenu={setOpenMenu} />
                </nav>
            </div>
            <div className="transport">
                <button className="transport-btn" onClick={onStop} title="Stop">
                    ⏹
                </button>
                <button className="transport-btn play" onClick={onPlay} title="Play">
                    {playing ? '⏸' : '▶'}
                </button>
                <span className="time-display">{fmt(pos)}</span>
                <div className="transport-right">
                    <label>
                        BPM <input type="number" value={bpm} min={20} max={300} onChange={(e) => setBpm(+e.target.value)} />
                    </label>
                </div>
            </div>
        </header>
    );
}
