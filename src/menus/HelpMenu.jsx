export default function HelpMenu({ handlers, openMenu, setOpenMenu }){
  const { onShortcuts, onWhatsNew } = handlers
  const active = openMenu === 'help'
  return (
    <div className={'menu-item' + (active ? ' active' : '')} onClick={e=>{e.stopPropagation();setOpenMenu(active?null:'help')}} data-menu="help">
      Help
      <div className="dropdown">
        <div className="dropdown-row" onClick={onShortcuts}>Keyboard Shortcuts</div>
        <div className="dropdown-row" onClick={onWhatsNew}>What's New</div>
      </div>
    </div>
  )
}
