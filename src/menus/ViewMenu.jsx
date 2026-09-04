export default function ViewMenu({ handlers, openMenu, setOpenMenu, prefs }){
  const { onWaveColors, onVuMeters, onCompact } = handlers
  const active = openMenu === 'view'
  return (
    <div className={'menu-item' + (active ? ' active' : '')} onClick={e=>{e.stopPropagation();setOpenMenu(active?null:'view')}} data-menu="view">
      View
      <div className="dropdown">
        <div className="dropdown-row" onClick={onWaveColors}><span>Show Waveform Colors</span><span className="kbd">{prefs&&prefs.waveColors?'✓':'○'}</span></div>
        <div className="dropdown-row" onClick={onVuMeters}><span>Show VU Meters</span><span className="kbd">{prefs&&prefs.vu?'✓':'○'}</span></div>
        <div className="dropdown-row" onClick={onCompact}><span>Compact Channel Strips</span><span className="kbd">{prefs&&prefs.compact?'✓':'○'}</span></div>
      </div>
    </div>
  )
}
