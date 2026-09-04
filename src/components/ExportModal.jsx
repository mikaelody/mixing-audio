import React, { useState } from 'react'
import Modal from './Modal.jsx'

/* Export / Download dialog (AudioMass-style).
   Determines the OUTPUT TYPE (mp3 / wav / flac) and QUALITY
   (bitrate, bit depth, dither, compression, channels) of the mix. */
const FORMATS = [
  { id:'mp3',  label:'MP3',    hint:'Kompresi lossy · ukuran kecil · cocok upload & sharing' },
  { id:'wav',  label:'WAV',    hint:'Lossless PCM · kualitas studio · 44.1 kHz' },
  { id:'flac', label:'FLAC',   hint:'Lossless terkompresi · kualitas penuh · ukuran sedang' },
]

export default function ExportModal({ trackCount, duration, onClose, onExport }){
  const [name, setName] = useState('kael-mixing-mix')
  const [format, setFormat] = useState('mp3')
  const [bitrate, setBitrate] = useState(192)      // mp3 kbps
  const [bitDepth, setBitDepth] = useState(16)     // wav 16/24/32
  const [dither, setDither] = useState(false)      // wav tpdf dither
  const [compression, setCompression] = useState(5)// flac 0..8
  const [channels, setChannels] = useState(2)      // 1 mono / 2 stereo
  const [range, setRange] = useState('whole')      // whole | selection
  const [busy, setBusy] = useState(false)

  const ext = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'wav'
  const fileName = (name.trim() || 'kael-mixing-mix') + '.' + ext

  const submit = async ()=>{
    if(busy) return
    setBusy(true)
    try{
      await onExport({
        fileName, format, bitrate, bitDepth, dither, compression, channels, range,
      })
      onClose()
    }catch(e){
      /* onExport already flashes the error; keep dialog open so settings aren't lost */
    }finally{
      setBusy(false)
    }
  }

  const fmtDur = (s)=>{ s=Math.max(0, Math.floor(s||0)); const m=Math.floor(s/60), r=s%60
    return `${m}:${String(r).padStart(2,'0')}` }

  return (
    <Modal title="Export / Download" onClose={onClose}>
      <div className="export-body">

        <div className="export-block">
          <label className="export-label">File Name</label>
          <div className="export-filename">
            <input className="export-name-input" value={name} spellCheck={false}
              onChange={e=>setName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') submit() }} />
            <span className="export-ext">.{ext}</span>
          </div>
        </div>

        <div className="export-block">
          <label className="export-label">Format</label>
          <div className="export-formats">
            {FORMATS.map(f=>{
              const on = format===f.id
              return (
                <button key={f.id} type="button"
                  className={'export-format' + (on?' on':'')}
                  onClick={()=>setFormat(f.id)}>
                  <span className="export-radio">{on?'●':''}</span>
                  <span className="export-format-name">{f.label}</span>
                  <span className="export-format-hint">{f.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {format==='mp3' && (
          <div className="export-block">
            <label className="export-label">Bitrate</label>
            <div className="export-opt-row">
              {[128,192,256,320].map(b=>(
                <button key={b} type="button"
                  className={'export-opt' + (bitrate===b?' on':'')}
                  onClick={()=>setBitrate(b)}>{b} kbps</button>
              ))}
            </div>
          </div>
        )}

        {format==='wav' && (
          <div className="export-block">
            <label className="export-label">Bit Depth</label>
            <div className="export-opt-row">
              {[16,24,32].map(b=>(
                <button key={b} type="button"
                  className={'export-opt' + (bitDepth===b?' on':'')}
                  onClick={()=>setBitDepth(b)}>{b==32?'32-bit float':b+'-bit'}</button>
              ))}
            </div>
            <label className="export-toggle">
              <input type="checkbox" checked={dither} onChange={e=>setDither(e.target.checked)} />
              <span>TPDF dither (haluskan noise kuantisasi pada bit rendah)</span>
            </label>
          </div>
        )}

        {format==='flac' && (
          <div className="export-block">
            <label className="export-label">Compression Level</label>
            <div className="export-slider-row">
              <span className="export-slider-note">Cepat · kecil</span>
              <input type="range" min={0} max={8} step={1} value={compression}
                onChange={e=>setCompression(+e.target.value)} className="export-range" />
              <span className="export-slider-note">Lambat · paling kecil</span>
            </div>
            <div className="export-slider-val">Level {compression}</div>
          </div>
        )}

        <div className="export-block">
          <label className="export-label">Channels</label>
          <div className="export-opt-row">
            <button type="button" className={'export-opt' + (channels===1?' on':'')}
              onClick={()=>setChannels(1)}>Mono</button>
            <button type="button" className={'export-opt' + (channels===2?' on':'')}
              onClick={()=>setChannels(2)}>Stereo</button>
          </div>
        </div>

        <div className="export-block">
          <label className="export-label">Export Range</label>
          <div className="export-opt-row">
            <button type="button" className={'export-opt' + (range==='whole'?' on':'')}
              onClick={()=>setRange('whole')}>Export whole file</button>
            <button type="button" className={'export-opt' + (range==='selection'?' on':'')}
              disabled title="Buat seleksi dulu di timeline"
              onClick={()=>setRange('selection')}>Export Selection Only</button>
          </div>
        </div>

        <div className="export-summary">
          <span>{trackCount} track · durasi {fmtDur(duration)}</span>
          <span className="export-summary-main">
            {format.toUpperCase()} · {format==='mp3' ? bitrate+' kbps' :
              format==='wav' ? bitDepth+'-bit' : 'Level '+compression}
            {' · '}{channels===1?'Mono':'Stereo'} · 44.1 kHz
          </span>
        </div>

        <div className="export-actions">
          <button className="btn ghost" onClick={onClose}>CANCEL</button>
          <button className="btn primary export-btn" onClick={submit} disabled={busy}>
            {busy ? 'Mengencode…' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
