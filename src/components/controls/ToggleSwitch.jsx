export default function ToggleSwitch({ label, sub, value, onChange }){
  return (
    <div className="toggle-row" onClick={()=>onChange(!value)}>
      <div>
        <div className="toggle-label">{label}</div>
        {sub && <div className="toggle-sub">{sub}</div>}
      </div>
      <div className={'switch'+(value?' on':'')}></div>
    </div>
  )
}
