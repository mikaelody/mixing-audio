# Mixing Audio

Editor audio multitrack yang berjalan sepenuhnya di browser. Muat beberapa file
audio, susun di timeline, pasang efek, lalu ekspor hasil mix ke WAV / MP3 / FLAC —
tanpa instalasi, tanpa akun, tanpa server.

React 18 + Vite + Tone.js (Web Audio API), styling CSS custom.

**Audio tidak pernah meninggalkan browser Anda.** Tidak ada backend, tidak ada
database, tidak ada upload. Semua decoding, DSP, dan encoding berjalan di
perangkat Anda sendiri.

---

## Fitur

### Track & timeline
- Multitrack tanpa batas jumlah — tiap track punya volume (dB), pan L/R, mute, solo, warna, dan nama sendiri
- Drag clip untuk menggeser posisi di timeline; **Snap to Grid** untuk magnet ke beat
- Zoom timeline dengan `⌘/Ctrl + scroll`, ter-anchor di posisi kursor
- Klik ruler atau waveform untuk seek — playback lanjut dari titik itu
- Seleksi region: `Shift + drag` pada waveform, lalu terapkan efek hanya ke bagian itu
- VU meter real-time per track, mode Compact untuk banyak track sekaligus
- Metronome (click) saat play, dan Seamless Loop

### Sumber audio
| Cara | Keterangan |
|---|---|
| Load from Computer | file picker, atau drag & drop langsung ke area track |
| Load from URL | tempel URL file audio |
| Load Sample File | tone generator bawaan untuk uji cepat |
| New Recording | rekam dari mikrofon (`MediaRecorder`) |

### 19 efek audio
Dua mode berbeda, dan ini penting dipahami:

- **Realtime (non-destruktif)** — efek jadi node di `fxChain` track. Bisa diedit
  ulang parameternya kapan saja, atau dilepas, tanpa merusak audio aslinya.
- **Destruktif** — efek merender buffer baru lewat `OfflineAudioContext`. Dipakai
  untuk efek yang mengubah panjang/isi sampel, dan untuk efek yang diterapkan ke
  region terpilih.

| Grup | Efek |
|---|---|
| Dynamics (4) | Gain, Compressor, Normalize, Hard Limiter |
| Utility (5) | Fade In, Fade Out, Reverse, Invert, Remove Silence |
| EQ & Filter (3) | Paragraphic EQ, Graphic EQ (10 band), Graphic EQ (20 band) |
| Time-based (3) | Delay, Distortion, Reverb |
| Restoration (2) | Noise Reduction (Voice), Audio Repair |
| Pitch & Time (2) | Speed Up / Slow Down (pitch), Speed / Playback Rate |

Efek yang terpasang muncul sebagai chip di **fx rack** (bar bawah). Klik nama chip
untuk mengedit parameternya, klik `✕` untuk melepasnya.

### Export
`File → Export / Download`, pilih **WAV** (16-bit PCM), **MP3** (lamejs, bitrate
diatur), atau **FLAC** (libFLAC via WASM). Bisa mono atau stereo, dan bisa
mengekspor seluruh mix atau hanya region yang terpilih.

### Draft lokal
`⌘S` menyimpan draft ke **IndexedDB** — termasuk audio tiap track sebagai Blob WAV,
jadi setelah menutup tab dan membukanya kembali, audionya benar-benar kembali.
Draft bersifat per-browser: tidak ikut pindah antar perangkat, dan sesi private/incognito
menghapusnya saat ditutup. Delapan draft terbaru disimpan; yang lebih tua dipangkas
otomatis agar tidak menabrak kuota penyimpanan browser.

### Lain-lain
- Undo / Redo hingga 40 langkah (`⌘Z` / `⌘⇧Z`)
- Error boundary: kalau ada crash, muncul pesan + tombol muat ulang, bukan layar putih
- Semua perintah ada di dropdown topbar: File, Edit, Effects, View, Help

---

## Keyboard shortcut

| Tombol | Aksi |
|---|---|
| `Space` | Play / Pause |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |
| `⌘A` | Select All |
| `⌘E` | Export / Download |
| `⌘S` | Save Draft Locally |
| `⌘M` | Metronome on/off |
| `⌘` + scroll | Zoom timeline |
| `Shift` + drag | Pilih region pada clip |

Pada Windows/Linux, `⌘` = `Ctrl`. Sisa perintah dijalankan lewat dropdown topbar.

---

## Cara menjalankan

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # build production ke dist/
npm run preview  # cek hasil build sebelum deploy
npm test         # Vitest — 24 test
```

Butuh Node 18+.

---

## Deploy

Output build murni file statis, jadi cukup static hosting mana pun:

```bash
npm run build              # hasil di dist/ (~1.2 MB, 134 kB gzip)
npx vercel deploy --prod   # atau: netlify deploy --prod --dir=dist
```

Tidak ada environment variable, tidak ada SPA rewrite rule yang perlu diatur
(aplikasi ini tidak memakai router).

**Wajib HTTPS di produksi.** Fitur New Recording memakai `getUserMedia`, yang
hanya berjalan di secure context — `localhost` dikecualikan, domain HTTP biasa
tidak. Vercel/Netlify/Cloudflare Pages sudah HTTPS secara default.

### Kompatibilitas browser
Butuh Web Audio API, `OfflineAudioContext`, dan IndexedDB — Chrome, Edge, Firefox,
dan Safari versi modern semuanya memenuhi. Browser memblokir audio sebelum ada
interaksi user, jadi suara baru hidup setelah klik pertama (perilaku normal, bukan bug).

---

## Arsitektur

```
src/
├── audio/              DSP murni, tanpa JSX
│   ├── dsp.js              operasi buffer: normalize, fade, reverse, invert,
│   │                       removeSilence, extract/replaceRegion, WAV encoder
│   ├── applyEffect.js      router efek → node realtime atau buffer destruktif
│   ├── effectsConfig.js     definisi 19 efek + field parameter + preset EQ
│   ├── exportEncoders.js   WAV / MP3 (lamejs) / FLAC (libFLAC WASM)
│   └── draftStore.js       wrapper IndexedDB untuk draft
├── components/
│   ├── Topbar.jsx          menubar + transport + BPM
│   ├── TrackLane.jsx       waveform canvas, clip draggable, seleksi region
│   ├── ChannelStrip.jsx    kontrol per track di sidebar
│   ├── BottomFxBar.jsx     fx rack track aktif
│   ├── SelectionBar.jsx    bar floating saat ada region terpilih
│   ├── EffectModal.jsx     form parameter efek, dibangun dari effectsConfig
│   ├── ExportModal.jsx     pilihan format & kualitas
│   ├── ErrorBoundary.jsx   penangkap crash
│   ├── Ruler.jsx / Modal.jsx
│   └── controls/           HSlider, ToggleSwitch, FieldSelect, EqBandGrid
├── menus/                  satu file per dropdown: File, Edit, Effects, View, Help
├── test/                   Vitest + jsdom
├── App.jsx                 state pusat: transport, tracks, efek, history, draft
├── main.jsx                entry point
└── index.css               seluruh styling (tema dark teal)
```

### Aliran data

```
effectsConfig.js          definisi efek & preset
       ↓
App.jsx                   state pusat (tracks, fxChain, transport, history)
       ↓
menus/*.jsx               memicu aksi (load, pickEffect, undo, export)
       ↓
EffectModal.jsx           user mengatur parameter
       ↓
applyEffect.js  →  dsp.js       node realtime, atau buffer audio baru
       ↓
TrackLane.jsx + BottomFxBar.jsx  render waveform & fx rack
```

### Signal chain per track

```
Tone.Player → panner → fxChain[…] → volume → meter → destination
```

Efek realtime disisipkan di `fxChain`; menambah atau melepas efek akan
menyambung ulang rantai ini tanpa menyentuh buffer audio aslinya.

---

## Testing

```bash
npm test
```

24 test dengan Vitest + jsdom, mencakup fungsi DSP (byte-level round-trip),
persistensi draft di IndexedDB termasuk pemangkasan 8-draft, error boundary
dua arah, dan render UI utama.

Verifikasi audio tidak berhenti di "tidak ada error" — perubahan DSP dibuktikan
dengan mengukur RMS PCM di dalam dan di luar region yang diproses.

---

## Tema

Dark teal — aksen `#4ed9c0` di atas `#0a0c0f`/`#12161c`. Font: Space Grotesk
(judul), Inter (UI), JetBrains Mono (angka & waktu). Semua ukuran panel dan
tinggi baris didefinisikan sebagai CSS variable di `:root`, jadi layout dihitung
dari satu sumber, bukan angka ajaib yang tersebar.

---

## Catatan teknis

- `wavesurfer.js` masih terdaftar di `package.json` tapi tidak dipakai — rendering waveform digambar sendiri di canvas. Aman untuk dihapus.
- Undo menyimpan metadata track (volume, pan, efek, offset), bukan salinan buffer audio — 40 langkah tetap ringan di memori.
- Draft menyimpan **nama** efek, bukan nilai parameternya, jadi efek pulih dengan setting default. Serialisasi parameter penuh belum diperlukan sejauh ini.

---

## Lisensi

© 2026 Mikhael. All rights reserved.

Proyek ini bersifat proprietary — tidak diizinkan menyalin, mendistribusikan,
memodifikasi, atau menggunakan kode ini untuk keperluan komersial tanpa izin
tertulis dari pemegang hak cipta.

Dependency pihak ketiga (React, Tone.js, lamejs, libFLAC) tetap berada di bawah
lisensinya masing-masing.
