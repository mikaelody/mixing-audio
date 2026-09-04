# Kael

Multi-track audio editor & music composer — React + Tone.js.

## Arsitektur

```
src/
├── audio/          DSP murni, tanpa JSX (dsp.js, applyEffect.js, effectsConfig.js)
├── components/     Komponen UI React (Modal, Topbar, TrackLane, dll.)
│   └── controls/   Kontrol reusable (slider, toggle, select, EQ grid)
├── menus/          Satu file per menu dropdown topbar
├── test/           Vitest setup + test file
├── App.jsx         State utama DAW: transport, track, efek, history
├── main.jsx        Entry point React
└── index.css       Semua styling (dark teal theme)
```

### Aliran data

```
effectsConfig.js  ← data efek & preset EQ
       ↓
App.jsx  ← state pusat (tracks, efek, transport, history)
       ↓
menus/*.jsx  ← trigger aksi (load, pickEffect, undo, dll.)
       ↓
EffectModal.jsx  ← tampilkan parameter, atur nilai
       ↓
applyEffect.js  →  dsp.js  →  buffer audio baru
       ↓
TrackLane.jsx  ← render waveform + clip draggable
```

## Cara menjalankan

```bash
npm run dev      # → http://localhost:5173
npm run build    # build production ke dist/
npm test         # Vitest (13 test)
```

## Theme

Dark teal (`#4ed9c0` on `#12161c`), dropdown menus, full-width layout.

## Dibuat dengan

- React 19 + Vite
- Tone.js (Web Audio API)
- Vitest + jsdom (testing)