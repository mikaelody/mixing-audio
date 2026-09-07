// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as Tone from 'tone'
import { EFFECTS, BAKED_EFFECT_IDS, fxSummary } from '../audio/effectsConfig.js'
import { processEffect, destructiveBuffer } from '../audio/applyEffect.js'

function mkBuffer(len = 44100, sr = 44100, channels = 1) {
  const ctx = new OfflineAudioContext(channels, len, sr)
  const b = ctx.createBuffer(channels, len, sr)
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05)
  }
  return b
}

describe('Semua 19 Efek — Pemeriksaan Menyeluruh', () => {
  it('ada tepat 19 efek dalam katalog', () => {
    expect(EFFECTS.length).toBe(19)
  })

  for (const eff of EFFECTS) {
    it(`efek [${eff.id}] "${eff.name}" dapat diproses tanpa crash`, async () => {
      const p = {}
      ;(eff.fields || []).forEach(f => {
        if (f.def !== undefined) p[f.id] = f.def
      })
      if (eff.custom === 'graphicEQ' || eff.custom === 'graphicEQ20') {
        eff.bands.forEach((_, i) => { p['g' + i] = 0 })
      }

      // 1. Uji fxSummary
      const summary = fxSummary(eff, p)
      expect(typeof summary).toBe('string')
      expect(summary.length).toBeGreaterThan(0)

      // 2. Uji processEffect
      const res = await processEffect(eff, p)
      expect(res).toBeDefined()
      expect(res.flash).toBeUndefined() // Tidak boleh jatuh ke default fallback

      // 3. Uji destructiveBuffer jika baked
      if (BAKED_EFFECT_IDS.includes(eff.id) || res.buffer) {
        const buf = mkBuffer(4410) // 0.1s audio
        const out = await destructiveBuffer(eff, buf, p)
        expect(out).toBeDefined()
        expect(out.length).toBeGreaterThan(0)
      }
    })
  }
})
