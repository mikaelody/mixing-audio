import React, { useRef, useState } from 'react'

/* Sidebar channel strip (vertical "clip" layout, reference-style).
   Top: track icon (track color) + number + editable name + ⋮ menu.
   Middle: Mute / Solo / Collapse + "+ Fx" + fx chips.
   Bottom: volume slider (with live dB), pan knob (L/R), optional VU meter.
   Supports drag-and-drop reorder via HTML5 drag. */
export default function ChannelStrip({ t, selected = false, compact = false, vu = true, vuLevel = 0, index = 0, total = 0,
  onSelect, onMute, onSolo, onRemove, onRename, onVol, onPan, onReplace, onEffects, onRemoveFx, onRemoveBaked, onMoveTrack,
  onCollapse }) {
    const fileRef = useRef(null)
    const moreRef = useRef(null)
    const [menuOpen, setMenuOpen] = useState(false)
    /* posisi menu ⋮ dalam koordinat viewport (position:fixed) — dihitung saat dibuka */
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

    /* drag reorder: each strip is draggable; onDragStart sets the source index */
    const dragStart = (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
    }
    const dragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }
    const drop = (e) => {
        e.preventDefault()
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
        if (!isNaN(from) && onMoveTrack) onMoveTrack(from, index)
    }

    const vol = t.volumeDb || 0
    /* map -60..12 dB to 0..100% for the slider fill */
    const pct = Math.max(0, Math.min(100, ((vol + 60) / 72) * 100))

    return (
        <div
            className={'channel-strip' + (t.mute ? ' muted' : '') + (selected ? ' active' : '') + (compact ? ' compact' : '') + (t.collapsed ? ' collapsed' : '')}
            style={{ borderLeftColor: t.color }}
            draggable={total > 1}
            onDragStart={dragStart}
            onDragOver={dragOver}
            onDrop={drop}
            onClick={onSelect}
        >
            <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files[0]
                    if (f) onReplace(f)
                    e.target.value = ''
                }}
            />

            {/* ---- header: icon + number + name + ⋮ ---- */}
            <div className="cs-head">
                <span className="cs-icon" style={{ background: t.color, boxShadow: '0 0 8px ' + t.color + '55' }}>♪</span>
                <span className="cs-num" style={{ color: t.color }}>{String(index + 1).padStart(2, '0')}</span>
                <input
                    className="track-name"
                    defaultValue={t.name}
                    title={t.name}
                    style={{ color: t.color }}
                    onBlur={(e) => {
                        if (e.target.value !== t.name) onRename(e.target.value)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur()
                    }}
                />
                <div className="cs-menu-wrap">
                    <button
                        ref={moreRef}
                        className={'cs-more' + (menuOpen ? ' on' : '')}
                        title="Opsi track"
                        onClick={(e) => {
                            e.stopPropagation()
                            /* Menu dirender position:fixed supaya TIDAK terpotong oleh
                               overflow:hidden milik .channel-strip / .channel-strips
                               (strip compact hanya 78px, menu 70px — dulu kepotong). */
                            if (!menuOpen && moreRef.current) {
                                const r = moreRef.current.getBoundingClientRect()
                                const MENU_H = 74, MENU_W = 140
                                const below = window.innerHeight - r.bottom
                                setMenuPos({
                                    top: below >= MENU_H + 8 ? r.bottom + 4 : r.top - MENU_H - 4,
                                    left: Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)
                                })
                            }
                            setMenuOpen(v => !v)
                        }}
                    >⋮</button>
                    {menuOpen && (
                        <div className="cs-menu" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpen(false)
                                fileRef.current && fileRef.current.click()
                            }}>Ganti Audio…</button>
                            <button className="danger" onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpen(false)
                                onRemove()
                            }}>Hapus Track</button>
                        </div>
                    )}
                </div>
            </div>

            {!t.collapsed && (
                <>
                    {/* ---- row 2: M / S / ∨ / +Fx + chip efek (satu baris, scroll horizontal) ---- */}
                    <div className="cs-btns">
                        <button
                            className={'msr' + (t.mute ? ' on' : '')}
                            onClick={(e) => { e.stopPropagation(); onMute() }}
                            title="Mute"
                        >M</button>
                        <button
                            className={'msr' + (t.solo ? ' on' : '')}
                            onClick={(e) => { e.stopPropagation(); onSolo() }}
                            title="Solo"
                        >S</button>
                        <button
                            className="msr ghost"
                            onClick={(e) => { e.stopPropagation(); onCollapse() }}
                            title="Collapse / Expand"
                        >∨</button>
                        <span
                            className="fx-chip add"
                            onClick={(e) => { e.stopPropagation(); onEffects() }}
                        >+ Fx</span>
                        {/* chip efek terpasang (baked + realtime fxChain) — ikut di baris yang sama supaya tinggi strip tetap */}
                        <div className="ch-fx">
                            {(t.baked || []).map((r, i) => (
                                <span
                                    key={'b-' + i}
                                    className="fx-chip"
                                    title={'Hapus ' + r.id}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveBaked && onRemoveBaked(i)
                                    }}
                                >
                                    {r.id} ✕
                                </span>
                            ))}
                            {(t.fxChain || []).map((fx, i) => (
                                <span
                                    key={'f-' + i}
                                    className="fx-chip"
                                    title={'Hapus ' + fx.type}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveFx(i)
                                    }}
                                >
                                    {fx.type} ✕
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* ---- row 3: volume slider ---- */}
                    <div className="cs-vol">
                        <span className="cs-vol-label">Vol</span>
                        <input
                            type="range"
                            className="vol-slider"
                            min={-60}
                            max={12}
                            step={0.5}
                            value={vol}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onVol(parseFloat(e.target.value))}
                            style={{ '--vol-pct': pct + '%' }}
                        />
                        <span className="cs-vol-db">{Math.round(vol)}dB</span>
                    </div>

                    {/* ---- row 4: pan knob + VU meter horizontal (satu baris) ---- */}
                    <div className="cs-pan">
                        <span className="cs-pan-side">L</span>
                        <div className="knob" title="Pan (drag horizontal)" onMouseDown={makePanDrag(onPan, t)}>
                            {Math.round((t.pan || 0) * 100)}
                        </div>
                        <span className="cs-pan-side">R</span>
                        {vu && (
                            <div className="vu" title="Level">
                                <div className="vu-fill" style={{ width: Math.round(vuLevel * 100) + '%' }}></div>
                            </div>
                        )}
                    </div>
                </>
            )}
            {t.collapsed && (
                <div className="cs-btns">
                    <button
                        className="msr ghost"
                        onClick={(e) => { e.stopPropagation(); onCollapse() }}
                        title="Expand track"
                    >∨</button>
                    <span className="cs-collapsed-hint">Track dikecilkan</span>
                </div>
            )}
        </div>
    )
}

/* horizontal drag → pan */
function makePanDrag(onPan, t) {
    return (e) => {
        e.preventDefault()
        const startX = e.clientX,
            startP = t.pan || 0
        const move = (ev) => {
            const dx = ev.clientX - startX
            onPan(Math.max(-1, Math.min(1, startP + dx / 100)))
        }
        const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
    }
}
