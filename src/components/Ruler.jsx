import React, { useRef, useMemo, useCallback } from 'react'

/* Horizontal time ruler.
 *
 * Tiga aturan yang membuat ruler "sesuai":
 *  1. SATU tangga langkah (TICK_STEPS) yang dipilih berdasarkan kerapatan piksel,
 *     bukan rantai if pxPerSec — jadi jarak antar label selalu >= MIN_MAJOR_PX
 *     dan tidak pernah melonjak dari 80px ke 200px saat zoom.
 *  2. Label memakai format jam yang SAMA dengan transport (m:ss / m:ss.d), bukan
 *     angka detik mentah — ruler dan jam di topbar tidak lagi bercerita beda.
 *  3. Posisi tick dihitung EKSAK (tanpa Math.round) memakai rumus identik dengan
 *     playhead (sec * pxPerSec), sehingga garis playhead jatuh persis di ticknya.
 *
 * Seluruh layer hidup di dalam konten yang di-scroll, jadi browser yang
 * menggesernya (tanpa re-render per frame). Klik di mana pun = seek ke titik itu.
 */

/* langkah major yang "manusiawi": sub-detik → detik → menit */
const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
const MIN_MAJOR_PX = 88   /* jarak minimum antar label supaya teks tidak berhimpit */
const MIN_MINOR_PX = 11   /* di bawah ini tick minor jadi bubur, jangan digambar */

export function chooseStep(pxPerSec){
  for(const s of TICK_STEPS){ if(s * pxPerSec >= MIN_MAJOR_PX) return s }
  return TICK_STEPS[TICK_STEPS.length - 1]
}

/* berapa belah tick minor di dalam satu major — ikut basis waktunya:
   langkah 5/10/15/30/60 dibagi 5 (kelipatan bulat), sisanya dibagi 4 */
export function minorDiv(step){
  const base5 = [5, 10, 15, 30, 60, 300, 600]
  return base5.includes(step) ? 5 : 4
}

/* format label = format jam transport. step < 1 menambah satu digit desimal
   supaya 0.5s tidak tampil sebagai "0:00" dua kali berturut-turut. */
export function fmtTick(sec, step){
  const m = Math.floor(sec / 60)
  const rest = sec - m * 60
  if(step < 1){
    const s = Math.floor(rest)
    const d = Math.round((rest - s) * 10)
    /* pembulatan bisa mendorong .10 → naikkan detiknya */
    const s2 = d === 10 ? s + 1 : s
    const d2 = d === 10 ? 0 : d
    return `${m}:${String(s2).padStart(2,'0')}.${d2}`
  }
  return `${m}:${String(Math.round(rest)).padStart(2,'0')}`
}

export default function Ruler({ width=800, pxPerSec=80, onSeek }){
  const step = chooseStep(pxPerSec)
  const totalSec = width / pxPerSec

  const { majors, minors } = useMemo(()=>{
    const maj = []
    const min = []
    const div = minorDiv(step)
    const minorPx = (step / div) * pxPerSec
    const drawMinor = minorPx >= MIN_MINOR_PX
    const n = Math.floor(totalSec / step)
    for(let i=0; i<=n; i++){
      const sec = i * step
      maj.push(sec)
      if(drawMinor){
        for(let k=1; k<div; k++){
          const ms = sec + (step / div) * k
          if(ms <= totalSec) min.push(ms)
        }
      }
    }
    return { majors: maj, minors: min }
  },[totalSec, step, pxPerSec])

  const wrapRef = useRef(null)

  const handleClick = useCallback((e)=>{
    if(!wrapRef.current || !onSeek) return
    const rect = wrapRef.current.getBoundingClientRect()
    onSeek((e.clientX - rect.left) / pxPerSec)
  },[pxPerSec, onSeek])

  return (
    <div className="ruler" ref={wrapRef} style={{width, minWidth:width}} onClick={handleClick}
      title="Klik untuk memindahkan playhead ke posisi ini">
      <div className="ruler-layer">
        {minors.map(sec=>(
          <div className="ruler-tick minor" key={'m'+sec} style={{left: sec*pxPerSec}}></div>
        ))}
        {majors.map(sec=>(
          <div className="ruler-tick" key={sec} style={{left: sec*pxPerSec}}>
            <span className="ruler-num">{fmtTick(sec, step)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
