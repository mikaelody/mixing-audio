import { useRef } from 'react'

export default function HSlider({ label, value, min, max, step=1, unit='', readonly=false, onChange }){
  const trackRef=useRef(null)
  const decimals = step<1 ? (String(step).split('.')[1]||'').length : 0
  const pct = ((value-min)/(max-min))*100

  const fromX = (clientX)=>{
    const rect=trackRef.current.getBoundingClientRect()
    let r=(clientX-rect.left)/rect.width; r=Math.max(0,Math.min(1,r))
    let v=min+r*(max-min)
    v=Math.round(v/step)*step
    return Math.max(min,Math.min(max,v))
  }

  return (
    <div className="h-row">
      <div className="h-row-top">
        <span className="h-label">{label}</span>
        <span className="h-value">{value.toFixed(decimals)}{unit}</span>
      </div>
      <div className={'h-track'+(readonly?' readonly':'')} ref={trackRef}
        onPointerDown={e=>{
          if(readonly) return
          const move=ev=>onChange(fromX(ev.clientX))
          move(e)
          const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)}
          window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
        }}>
        <div className="h-fill" style={{width:`${pct}%`}}></div>
        {!readonly && <div className="h-thumb" style={{left:`${pct}%`}}></div>}
      </div>
    </div>
  )
}
