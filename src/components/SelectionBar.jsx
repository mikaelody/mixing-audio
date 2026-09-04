import React from 'react'

/* Floating bar shown while a clip region is selected (Shift+drag on a clip).
   Offers: add effect to the selection · play the selection · clear. */
export default function SelectionBar({ start, end, trackName, onApplyEffect, onClear, aboveFx=false }){
  return (
    <div className={'sel-bar' + (aboveFx ? ' above-fx' : '')}>
      <span className="sel-bar-label">Seleksi</span>
      <span className="sel-bar-time">{start.toFixed(2)}s → {end.toFixed(2)}s</span>
      <span className="sel-bar-track">{trackName}</span>
      <button className="sel-bar-btn primary" onClick={onApplyEffect}>+ Efek ke Seleksi</button>
      <button className="sel-bar-btn" onClick={onClear}>Clear</button>
    </div>
  )
}