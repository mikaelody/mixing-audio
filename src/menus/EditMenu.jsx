export default function EditMenu({ handlers, openMenu, setOpenMenu }){
  const { onUndo, onRedo, onSelectAll, onDeselect, onChannelInfo, onLoop, onZeroCross, loop, onSnap, snap, onMetronome, metronome } = handlers
  const active = openMenu === 'edit'
  return (
    <div className={'menu-item' + (active ? ' active' : '')} onClick={e=>{e.stopPropagation();setOpenMenu(active?null:'edit')}} data-menu="edit">
      Edit
      <div className="dropdown">
        <div className="dropdown-row" onClick={onUndo}><span>Undo</span><span className="kbd">⌘Z</span></div>
        <div className="dropdown-row" onClick={onRedo}><span>Redo</span><span className="kbd">⌘⇧Z</span></div>
        <div className="dropdown-divider"></div>
        <div className="dropdown-row" onClick={onSelectAll}><span>Select All</span><span className="kbd">⌘A</span></div>
        <div className="dropdown-row" onClick={onDeselect}><span>Deselect All</span><span className="kbd">⌘⇧A</span></div>
        <div className="dropdown-divider"></div>
        <div className="dropdown-row" onClick={onChannelInfo}>Channel Info / Flip</div>
        <div className="dropdown-row" onClick={onLoop}><span>Seamless Loop</span><span className="kbd">{loop?'✓':'○'}</span></div>
        <div className="dropdown-row" onClick={onSnap}><span>Snap to Grid</span><span className="kbd">{snap?'✓':'○'}</span></div>
        <div className="dropdown-row" onClick={onMetronome}><span>Metronome</span><span className="kbd">{metronome?'✓':'○'} ⌘M</span></div>
        <div className="dropdown-row" onClick={onZeroCross}>Zero-Cross Selection</div>
      </div>
    </div>
  )
}
