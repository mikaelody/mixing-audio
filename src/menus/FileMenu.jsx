export default function FileMenu({ handlers, openMenu, setOpenMenu }){
  const { onExport, onLoadComputer, onLoadSample, onLoadUrl, onRecord, recording, onSaveDraft, onLoadDraft } = handlers
  const active = openMenu === 'file'
  return (
    <div className={'menu-item' + (active ? ' active' : '')} onClick={e=>{e.stopPropagation();setOpenMenu(active?null:'file')}} data-menu="file">
      File
      <div className="dropdown">
        <div className="dropdown-row" onClick={onExport}><span>Export / Download</span><span className="kbd">⌘E</span></div>
        <div className="dropdown-row" onClick={onLoadComputer}>Load from Computer</div>
        <div className="dropdown-row" onClick={onLoadSample}>Load Sample File</div>
        <div className="dropdown-row" onClick={onLoadUrl}>Load from URL</div>
        <div className="dropdown-divider"></div>
        <div className="dropdown-row" onClick={onRecord}><span>{recording?'Stop Recording':'New Recording'}</span><span className="kbd">⌘N</span></div>
        <div className="dropdown-divider"></div>
        <div className="dropdown-row" onClick={onSaveDraft}><span>Save Draft Locally</span><span className="kbd">⌘S</span></div>
        <div className="dropdown-row" onClick={onLoadDraft}>Open Local Drafts</div>
      </div>
    </div>
  )
}
