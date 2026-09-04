/* =========================================================================
   exportEncoders.js — Encode an AudioBuffer to MP3 / WAV / FLAC in-browser.
   MP3  : @breezystack/lamejs (pure JS, LAME port)
   WAV  : hand-rolled PCM/float writer (16/24/32-bit, optional TPDF dither)
   FLAC : libflacjs (Emscripten WASM build of libFLAC)
   ========================================================================= */

/* ---------- helpers ---------- */

function toMonoPairs(buffer){
  /* return array of { l, r } objects for each frame (l/r = -1..1) */
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
  const out = new Float32Array(buffer.length)
  for (let i=0;i<buffer.length;i++) out[i] = (ch0[i] + (ch1 ? ch1[i] : ch0[i])) / 2
  return out
}

function toInterleavedInt16(buffer, numCh){
  /* numCh: 1 (mono mixdown) or 2 (stereo, L then R per frame) */
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0
  const pcm = new Int16Array(buffer.length * numCh)
  for (let i=0;i<buffer.length;i++){
    if (numCh === 1){
      let s = (ch0[i] + ch1[i]) / 2
      s = Math.max(-1, Math.min(1, s))
      pcm[i] = s < 0 ? s*0x8000 : s*0x7fff
    } else {
      let l = Math.max(-1, Math.min(1, ch0[i]))
      let r = Math.max(-1, Math.min(1, ch1[i]))
      pcm[i*2]   = l < 0 ? l*0x8000 : l*0x7fff
      pcm[i*2+1] = r < 0 ? r*0x8000 : r*0x7fff
    }
  }
  return pcm
}

/* ---------- MP3 (lamejs) ---------- */

export async function encodeMp3(buffer, kbps=192, channels=2){
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const numCh = channels === 1 ? 1 : 2
  const sr = buffer.sampleRate
  const encoder = new Mp3Encoder(numCh, sr, kbps)
  const pcm = toInterleavedInt16(buffer, numCh)
  const chunks = []
  const block = 1152 /* one MPEG frame */
  for (let i=0;i<buffer.length;i+=block){
    const len = Math.min(block, buffer.length - i)
    let data
    if (numCh === 1) data = encoder.encodeBuffer(pcm.subarray(i, i+len))
    else data = encoder.encodeBuffer(pcm.subarray(i*2, (i+len)*2), pcm.subarray(i*2+1, (i+len)*2+1))
    if (data && data.length) chunks.push(new Uint8Array(data))
  }
  const end = encoder.flush()
  if (end && end.length) chunks.push(new Uint8Array(end))
  return new Blob(chunks, { type:'audio/mpeg' })
}

/* ---------- WAV (hand-rolled) ---------- */

export function encodeWav(buffer, { bitDepth=16, dither=false, channels=2 } = {}){
  const numCh = channels === 1 ? 1 : 2
  const sr = buffer.sampleRate
  const frames = buffer.length
  const mono = numCh === 1 ? toMonoPairs(buffer) : null
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0
  const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = frames * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  const ws = (o,s)=>{ for(let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)) }
  const fmtTag = bitDepth === 32 ? 3 : 1 /* 3 = IEEE float, 1 = PCM */
  ws(0,'RIFF'); view.setUint32(4, 36+dataSize, true); ws(8,'WAVE'); ws(12,'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, fmtTag, true); view.setUint16(22, numCh, true)
  view.setUint32(24, sr, true); view.setUint32(28, sr*blockAlign, true)
  view.setUint16(32, blockAlign, true); view.setUint16(34, bitDepth, true); ws(36,'data'); view.setUint32(40, dataSize, true)
  let off = 44
  for (let i=0;i<frames;i++){
    for (let c=0;c<numCh;c++){
      let s = mono ? mono[i] : (c===0 ? ch0[i] : ch1[i])
      s = Math.max(-1, Math.min(1, s))
      if (bitDepth === 32){
        view.setFloat32(off, s, true); off += 4
      } else if (bitDepth === 24){
        if (dither) s += (Math.random()-Math.random())/8388608
        s = Math.max(-1, Math.min(1, s))
        const v = Math.round(s < 0 ? s*0x800000 : s*0x7fffff)
        view.setUint8(off,   v & 0xff)
        view.setUint8(off+1, (v>>8) & 0xff)
        view.setUint8(off+2, (v>>16) & 0xff)
        off += 3
      } else {
        if (dither) s += (Math.random()-Math.random())/32768
        s = Math.max(-1, Math.min(1, s))
        view.setInt16(off, Math.round(s < 0 ? s*0x8000 : s*0x7fff), true); off += 2
      }
    }
  }
  return new Blob([ab], { type:'audio/wav' })
}

/* ---------- FLAC (libflacjs WASM) ---------- */

let _flac = null

async function loadFlac(){
  if (_flac) return _flac
  const wasmUrl = (await import('libflacjs/dist/libflac.wasm.wasm?url')).default
  const jsUrl   = (await import('libflacjs/dist/libflac.wasm.js?url')).default
  /* tell the emscripten glue where the .wasm binary lives */
  globalThis.FLAC_SCRIPT_LOCATION = { 'libflac.wasm.wasm': wasmUrl }
  if (!window.Flac){
    await new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = jsUrl
      s.onload = res
      s.onerror = () => rej(new Error('FLAC library gagal dimuat'))
      document.head.appendChild(s)
    })
  }
  await new Promise((res, rej) => {
    const t = setTimeout(()=>rej(new Error('FLAC library timeout')), 15000)
    const check = () => {
      if (window.Flac && window.Flac.isReady && window.Flac.isReady()){ clearTimeout(t); res() }
      else setTimeout(check, 50)
    }
    check()
  })
  _flac = window.Flac
  return _flac
}

export async function encodeFlac(buffer, compression=5, channels=2){
  const Flac = await loadFlac()
  const numCh = channels === 1 ? 1 : 2
  const sr = buffer.sampleRate
  const bps = 16
  const pcm = toInterleavedInt16(buffer, numCh)
  const encoder = Flac.create_libflac_encoder(sr, numCh, bps, compression, buffer.length)
  if (!encoder) throw new Error('FLAC encoder gagal diinisialisasi')
  const chunks = []
  const status = Flac.init_encoder_stream(encoder, (data)=>{ chunks.push(data) })
  if (status !== 0) throw new Error('FLAC stream init error: '+status)
  const block = 65536
  for (let i=0;i<buffer.length;i+=block){
    const len = Math.min(block, buffer.length - i)
    Flac.FLAC__stream_encoder_process_interleaved(encoder, pcm.subarray(i*numCh, (i+len)*numCh), len)
  }
  Flac.FLAC__stream_encoder_finish(encoder)
  return new Blob(chunks, { type:'audio/flac' })
}

/* ---------- dispatcher ---------- */

export async function encodeBuffer(buffer, cfg){
  switch (cfg.format){
    case 'mp3':  return encodeMp3(buffer, cfg.bitrate, cfg.channels)
    case 'flac': return encodeFlac(buffer, cfg.compression, cfg.channels)
    default:     return encodeWav(buffer, cfg)
  }
}
