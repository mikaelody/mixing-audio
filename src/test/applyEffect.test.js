// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as Tone from 'tone'
import { processEffect } from '../audio/applyEffect.js'

/* Dua hal yang mudah rusak tanpa terlihat di UI:
   - Gain harus dibangun dengan unit 'decibels' (default Tone = gain linear, jadi
     -24 berarti -24x: inversi fase + amplifikasi, bukan -24 dB).
   - Preserve Pitch harus mengompensasi 12*log2(rate) semitone; kalau tidak,
     toggle-nya cuma hiasan dan efeknya identik dengan Speed Up / Slow Down. */
describe('processEffect', () => {
  beforeEach(() => {
    Tone.Gain.mockClear()
  })

  it('gain dibangun dalam dB, bukan gain linear', async () => {
    const res = await processEffect({ id: 'gain' }, { gainDb: -24 })
    expect(res.fx.type).toBe('Gain')
    expect(Tone.Gain).toHaveBeenCalledWith(-24, 'decibels')
  })

  it('playbackRate + Preserve Pitch mengompensasi pitch sebesar -12*log2(rate)', async () => {
    const up = await processEffect({ id: 'playbackRate' }, { prRate: 2, prPreserve: true })
    expect(up).toEqual({ playbackRate: 2, pitchComp: -12 })

    const down = await processEffect({ id: 'playbackRate' }, { prRate: 0.5, prPreserve: true })
    expect(down).toEqual({ playbackRate: 0.5, pitchComp: 12 })
  })

  it('tanpa Preserve Pitch (dan speedPitch) tidak ada kompensasi', async () => {
    const off = await processEffect({ id: 'playbackRate' }, { prRate: 2, prPreserve: false })
    expect(off).toEqual({ playbackRate: 2, pitchComp: 0 })

    const sp = await processEffect({ id: 'speedPitch' }, { spRate: 2 })
    expect(sp).toEqual({ playbackRate: 2, pitchComp: 0 })
  })
})
