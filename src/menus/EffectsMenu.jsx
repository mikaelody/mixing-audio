import { EFFECTS, EFFECT_GROUPS } from '../audio/effectsConfig'
export default function EffectsMenu({ onPick, openMenu, setOpenMenu }){
  const active = openMenu === 'effects'
  return (
    <div className={'menu-item' + (active ? ' active' : '')} onClick={e=>{e.stopPropagation();setOpenMenu(active?null:'effects')}} data-menu="effects">
      Effects
      <div className="dropdown wide">
        {EFFECT_GROUPS.map(group=>(
          <div className="fx-group" key={group}>
            <div className="dropdown-group-label">{group}</div>
            {EFFECTS.filter(e=>e.group===group).map(e=>(
              <div className="dropdown-row" key={e.id} onClick={()=>{onPick(e.id);setOpenMenu(null)}}>{e.name}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
