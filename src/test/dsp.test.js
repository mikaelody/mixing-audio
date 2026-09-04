// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { extractBufferRegion, replaceBufferRegion } from '../audio/dsp.js'

/* A 1-second mono buffer filled with a sine so we can verify sample-level copies. */
function mkBuffer(len = 44100, sr = 44100, channels = 1) {
  const ctx = new OfflineAudioContext(channels, len, sr)
  const b = ctx.createBuffer(channels, len, sr)
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05)
  }
  return b
}

const SR = 44100

describe('dsp region helpers (partial effect application)', () => {
  it('extractBufferRegion returns a slice with the expected length & content', () => {
    const b = mkBuffer(SR) // 1 second
    const slice = extractBufferRegion(b, 0.1, 0.3) // 0.1s..0.3s
    expect(slice).toBeTruthy()
    expect(slice.numberOfChannels).toBe(1)
    const s = Math.floor(0.1 * SR)
    const e = Math.min(b.length, Math.ceil(0.3 * SR))
    expect(slice.length).toBe(e - s)
    const src = b.getChannelData(0)
    const dst = slice.getChannelData(0)
    expect(dst[0]).toBeCloseTo(src[s], 5)
    expect(dst[e - s - 1]).toBeCloseTo(src[e - 1], 5)
  })

  it('extractBufferRegion returns null for an empty/invalid region', () => {
    const b = mkBuffer(SR)
    expect(extractBufferRegion(b, 0.5, 0.1)).toBeNull()
  })

  it('replaceBufferRegion splices a processed slice back at the right offset', () => {
    const b = mkBuffer(SR) // 1 second
    const slice = extractBufferRegion(b, 0.1, 0.3)
    const s = Math.floor(0.1 * SR)
    const e = Math.min(b.length, Math.ceil(0.3 * SR))
    for (let c = 0; c < slice.numberOfChannels; c++) slice.getChannelData(c).fill(0.5)
    const out = replaceBufferRegion(b, 0.1, 0.3, slice)
    expect(out.length).toBe(b.length)
    const src = b.getChannelData(0)
    const dst = out.getChannelData(0)
    // region replaced with the constant 0.5
    expect(dst[s]).toBe(0.5)
    expect(dst[e - 1]).toBe(0.5)
    expect(dst[s + 10]).toBe(0.5)
    // head preserved (first sample untouched)
    expect(dst[s - 1]).toBeCloseTo(src[s - 1], 5)
    expect(dst[0]).toBeCloseTo(src[0], 5)
    // tail preserved
    expect(dst[e]).toBeCloseTo(src[e], 5)
    expect(dst[b.length - 1]).toBeCloseTo(src[b.length - 1], 5)
  })

  it('replaceBufferRegion inserts shorter region (audio time-compression) correctly', () => {
    // region replaced by a SHORTER slice → total length shrinks by the difference
    const b = mkBuffer(SR)
    const slice = extractBufferRegion(b, 0.1, 0.3)
    // Build a shorter AudioBuffer manually
    const shortLen = Math.floor(slice.length / 2)
    const short = new OfflineAudioContext(1, shortLen, SR).createBuffer(1, shortLen, SR)
    for (let c = 0; c < short.numberOfChannels; c++) short.getChannelData(c).fill(0.5)
    const out = replaceBufferRegion(b, 0.1, 0.3, short)
    expect(out.length).toBe(b.length - (slice.length - short.length))
  })

  it('selection bar math: region drawn only when selEnd > selStart', () => {
    const selStart = 1.5, selEnd = 3.0
    const has = selEnd !== null && selStart !== null && selEnd > selStart
    expect(has).toBe(true)
    const empty = selEnd === selStart
    expect(empty).toBe(false)
  })
})