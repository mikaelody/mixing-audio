import React, { useRef, useEffect, useState } from 'react'

/* Draw a clip waveform to a canvas, positioned at offset pixels. */
function drawWaveform(canvas, buffer, color, offsetPx, durationPx){
  if(!canvas || !buffer) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || 200
  const h = canvas.clientHeight || 96
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  if(!ctx) return
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.clearRect(0,0,w,h)

  /* draw the clip as a colored rectangle with waveform inside */
  const mid = h/2
  const data = buffer.getChannelData(0)
  const step = Math.ceil(data.length / durationPx)
  const amp = h/2 - 4

  /* clip background */
  ctx.fillStyle = color || '#4ed9c0'
  ctx.globalAlpha = 0.08
  ctx.beginPath()
  ctx.roundRect(offsetPx, 0, durationPx, h, 4)
  ctx.fill()
  ctx.globalAlpha = 1

  /* clip border */
  ctx.strokeStyle = color || '#4ed9c0'
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(offsetPx, 0, durationPx, h, 4)
  ctx.stroke()
  ctx.globalAlpha = 1

  /* waveform */
  ctx.beginPath()
  ctx.moveTo(offsetPx, mid)
  for(let x=0; x<durationPx; x++){
    const start = Math.floor(x*step)
    let min=1, max=-1
    for(let i=start; i<Math.min(start+step, data.length); i++){
      const v=data[i]; if(v<min) min=v; if(v>max) max=v
    }
    ctx.lineTo(offsetPx+x, mid+min*amp)
    ctx.lineTo(offsetPx+x, mid+max*amp)
  }
  ctx.strokeStyle = color || '#4ed9c0'
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.85
  ctx.stroke()
  ctx.globalAlpha = 1
}

/* Timeline lane: renders a clip waveform at its offset position.
   Supports horizontal drag to reposition the clip (audio joiner),
   and Shift+drag to select a region for partial effect application. */
export default function TrackLane({ t, width, pxPerSec=80, waveColors=true,
                                    onDrop, onWaveClick, onSeek, compact=false,
                                    onOffsetChange, onClipDragStart, snap=false, snapRef, bpm=120, selected=false,
                                    selStart, selEnd, selTrackId, onSelectionChange }){
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [draggingSel, setDraggingSel] = useState(false)
  const [hover, setHover] = useState(false)
  const dragMovedRef = useRef(false)

  const offPx = (t.offset||0) * pxPerSec
  /* Sumbu timeline adalah DETIK TRANSPORT, dan playbackRate memang mengubah
     berapa lama klip berbunyi — jadi lebar lane harus dibagi rate. Tanpa ini
     Speed 2x tetap menggambar waveform sepanjang aslinya walau audionya
     selesai di separuh waktu, dan playhead lari mendahului gelombangnya. */
  const rate = t.playbackRate || 1
  const durPx = t.buf ? (t.buf.duration / rate) * pxPerSec : 0

  useEffect(()=>{
    if(!t.buf || !canvasRef.current) return
    /* redraw juga saat tinggi lane berubah (compact / collapsed) — canvas memakai
       clientHeight, jadi dependency-nya harus ikut flag tinggi */
    drawWaveform(canvasRef.current, t.buf, waveColors ? t.color : '#4ed9c0', 0, durPx)
  },[t.buf, t.color, waveColors, width, pxPerSec, t.offset, dragging, durPx, compact, t.collapsed])

  const handleClick = (e)=>{
    if(dragMovedRef.current) return
    if(e.shiftKey) return  /* selection handled by mousedown/mousemove */
    /* Baca rect SEBELUM efek samping apa pun. onWaveClick() memilih track dan
       dulu ikut menggeser scrollLeft; scroll itu langsung memindahkan rect lane,
       jadi kalau rect dibaca SETELAHNYA konversi px→detik meleset persis sebesar
       jarak scroll — inilah "klik waveform tapi playhead lompat ke tengah". */
    const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : null
    const sec = rect ? (e.clientX - rect.left) / pxPerSec : null
    if(onWaveClick) onWaveClick()
    if(onSeek && sec != null) onSeek(sec)
  }

  const handleMouseDown = (e)=>{
    if(!t.buf || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const currentOffPx = (t.offset||0) * pxPerSec
    /* durasi TERDENGAR (buffer/rate) untuk hit-test lane, dan `duration` tetap
       detik BUFFER karena seleksi dipakai untuk memotong sampel — px→buffer
       detik karena itu harus dikali rate. */
    const durPx = (t.buf.duration / rate) * pxPerSec
    const duration = t.buf.duration || 0

    /* Shift+drag = selection mode (overrides clip move) */
    if(e.shiftKey && x >= currentOffPx - 6 && x <= currentOffPx + durPx + 6){
      e.preventDefault()
      e.stopPropagation()
      setDraggingSel(true)
      const anchorSec = Math.max(0, Math.min(duration, ((x - currentOffPx) / pxPerSec) * rate))
      if(onSelectionChange) onSelectionChange(t.id, anchorSec, anchorSec)

      const onMove = (moveEv)=>{
        if(!wrapRef.current || !t.buf) return
        const r = wrapRef.current.getBoundingClientRect()
        const curX = moveEv.clientX - r.left
        const curOff = (t.offset||0) * pxPerSec
        const curLocal = Math.max(0, Math.min(duration, ((curX - curOff) / pxPerSec) * rate))
        const s = Math.min(anchorSec, curLocal)
        const e2 = Math.max(anchorSec, curLocal)
        if(onSelectionChange) onSelectionChange(t.id, s, e2)
      }

      const onUp = ()=>{
        setDraggingSel(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    /* regular drag = clip reposition */
    if(x >= currentOffPx - 2 && x <= currentOffPx + durPx + 2){
      e.preventDefault()
      e.stopPropagation()
      if(onClipDragStart) onClipDragStart()
      setDragging(true)
      dragMovedRef.current = false
      const startClientX = e.clientX
      const initialOffset = t.offset || 0

      const onMove = (moveEv)=>{
        const dx = moveEv.clientX - startClientX
        if(Math.abs(dx) > 3) dragMovedRef.current = true
        let newOffset = Math.max(0, initialOffset + dx / pxPerSec)
        if(snapRef && snapRef.current && snap){
          const beat = 60 / (bpm||120)
          newOffset = Math.round(newOffset / beat) * beat
        }
        if(onOffsetChange) onOffsetChange(t.id, newOffset)
      }

      const onUp = ()=>{
        setDragging(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setTimeout(()=>{ dragMovedRef.current = false }, 0)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  const hasSelection = selStart !== null && selEnd !== null && selEnd > selStart
  const isSelTrack = selTrackId === t.id

  return (
    <div className={'wave-lane'+(compact?' compact':'')+(t.collapsed?' collapsed':'')+(dragging?' dragging':'')+(selected?' selected':'')+(draggingSel?' sel-active':'')}
      ref={wrapRef}
      onDragOver={e=>e.preventDefault()}
      onDrop={onDrop}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}>
      {t.buf
        ? <div className="clip-wrap" style={{
            position:'absolute', left:offPx, top:0, width:durPx, height:'100%'
          }}
          title="Drag untuk memindahkan clip • Tahan Shift+drag untuk seleksi bagian audio">
            <canvas ref={canvasRef} className="waveform-cv" style={{width:durPx, minWidth:durPx}}></canvas>
            {/* selection region overlay */}
            {hasSelection && isSelTrack && (
              <div className="sel-region" style={{
                left: Math.max(0, (selStart / rate) * pxPerSec),
                width: Math.max(0, ((selEnd - selStart) / rate) * pxPerSec),
                height: '100%'
              }} />
            )}
            <div className="clip-label">{t.name}</div>
            <div className="clip-dur" style={{display:hover||dragging||draggingSel?'flex':'none'}}>
              {(t.buf.duration / rate).toFixed(2)}s{rate !== 1 ? ` @${rate.toFixed(2)}x` : ''}
            </div>
            <div className="clip-drag-handle" title="Drag untuk memindahkan clip">⠿</div>
          </div>
        : <div className="wave-empty" style={{width, minWidth:width}}>+ Klik atau drop audio di sini</div>}
    </div>
  )
}