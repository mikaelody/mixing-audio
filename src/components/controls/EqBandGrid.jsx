import { useRef } from 'react'

/* Vertical draggable EQ band column. value in dB (min..max), 0 = center. */
export default function EqBand({ label, value, min, max, onChange }){
  const ref=useRef(null)
  const safeValue = value ?? 0
  const setFromY = (clientY)=>{
    const rect=ref.current.getBoundingClientRect()
    let r=1-(clientY-rect.top)/rect.height; r=Math.max(0,Math.min(1,r))
    const v=min+r*(max-min)
    onChange(Math.round(v*10)/10)
  }
  const pct = ((safeValue-min)/(max-min))*100
  const sign = safeValue>0?'+':(safeValue<0?'':'')
  return (
    <div className="eq-band" data-min={min} data-max={max}>
      <span className="eq-db">{sign}{safeValue.toFixed(1)} db</span>
      <div className="eq-track" ref={ref}
        onPointerDown={e=>{
          const move=ev=>setFromY(ev.clientY)
          move(e)
          const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)}
          window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
        }}>
        <div className="eq-thumb" style={{top:`${100-pct}%`}}></div>
      </div>
      <span className="eq-freq">{label}</span>
    </div>
  )
}

export function EqBandGrid({ bands, values, min=-12, max=12, small=false, onChange }){
  return (
    <div className={'eq-bands'+(small?' small':'')}>
      {bands.map((label,i)=>(
        <EqBand key={i} label={label} value={values[i]||0} min={min} max={max}
          onChange={v=>onChange(i,v)} />
      ))}
    </div>
  )
}
