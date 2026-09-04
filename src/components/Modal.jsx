import React, { useEffect } from 'react'

/* Base modal shell. Footer shows Apply only when onApply is provided,
   so informational modals (Help, Channel Info, Drafts) render clean. */
export default function Modal({ title, onApply, onClose, children, wide=false, applyLabel='Apply' }){
  useEffect(()=>{
    const onKey = e=>{ if(e.key==='Escape' && onClose) onClose() }
    window.addEventListener('keydown', onKey)
    return ()=>window.removeEventListener('keydown', onKey)
  },[onClose])

  return (
    <div className="modal-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget && onClose) onClose() }}>
      <div className={'modal' + (wide?' wide':'')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {onApply && <button className="btn primary" onClick={onApply}>{applyLabel}</button>}
        </div>
      </div>
    </div>
  )
}
