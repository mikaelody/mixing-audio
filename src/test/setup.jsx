import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tone.js with proper exports
const Transport = {
  bpm: { value: 120 },
  loop: false,
  seconds: 0,
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  _paused: false,
}

const Player = vi.fn(function () {
  return {
    buffer: null,
    state: 'stopped',
    _synced: false,
    playbackRate: 1,
    mute: false,
    volume: { value: 0 },
    pan: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    sync: vi.fn().mockReturnThis(),
    unsync: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    toDestination: vi.fn().mockReturnThis(),
  }
})

/* function, bukan arrow: applyEffect memanggilnya dengan `new`, dan arrow
   function bukan constructor (vitest 4 melempar "is not a constructor"). */
const Gain = vi.fn(function (value, units) {
  return {
    gain: { value, units },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
  }
})

const Volume = vi.fn(function () {
  return {
    volume: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    toDestination: vi.fn().mockReturnThis(),
  }
})

const Panner = vi.fn(function () {
  return {
    pan: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const Meter = vi.fn(function () {
  return {
    getValue: () => -100,
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    toDestination: vi.fn().mockReturnThis(),
  }
})

const Compressor = vi.fn(function () {
  return {
    threshold: { value: -24 },
    knee: { value: 30 },
    ratio: { value: 12 },
    attack: { value: 0.003 },
    release: { value: 0.25 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const Limiter = vi.fn(function () {
  return {
    threshold: { value: -0.3 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const FeedbackDelay = vi.fn(function () {
  return {
    delayTime: { value: 0.35 },
    feedback: { value: 0.35 },
    wet: { value: 0.3 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const Distortion = vi.fn(function () {
  return {
    distortion: { value: 0.4 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const Reverb = vi.fn(function () {
  return {
    decay: { value: 3 },
    wet: { value: 0.25 },
    preDelay: { value: 0.02 },
    generate: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const Filter = vi.fn(function () {
  return {
    frequency: { value: 1000 },
    Q: { value: 1 },
    gain: { value: 0 },
    type: 'peaking',
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
  }
})

const context = { sampleRate: 44100, state: 'running', rawContext: null }
const Destination = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn().mockReturnThis(), volume: { value: 0 } }
const getContext = vi.fn(() => context)
const start = vi.fn().mockResolvedValue(undefined)
const loaded = vi.fn().mockResolvedValue(undefined)

vi.mock('tone', () => ({
  default: { Transport, Player, Gain, Volume, Panner, Meter, Compressor, Limiter, FeedbackDelay, Distortion, Reverb, Filter, context, Destination, getContext, start, loaded },
  Transport,
  Player,
  Gain,
  Volume,
  Panner,
  Meter,
  Compressor,
  Limiter,
  FeedbackDelay,
  Distortion,
  Reverb,
  Filter,
  context,
  Destination,
  getContext,
  start,
  loaded,
}))

// Mock OfflineAudioContext
global.OfflineAudioContext = class MockOfflineAudioContext {
  constructor(ch, len, sr) { this.numberOfChannels = ch; this.length = len; this.sampleRate = sr; this.destination = {} }
  createBufferSource() { return { buffer: null, connect: vi.fn().mockReturnThis(), start: vi.fn(), stop: vi.fn() } }
  createGain() { return { gain: { value: 1 }, connect: vi.fn().mockReturnThis() } }
  createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn().mockReturnThis() } }
  createBiquadFilter() { return { type: 'lowpass', frequency: { value: 20000 }, Q: { value: 1 }, connect: vi.fn().mockReturnThis() } }
  createOscillator() { return { type: 'sine', frequency: { value: 440 }, connect: vi.fn().mockReturnThis(), start: vi.fn(), stop: vi.fn() } }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len))
    const b = { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (c) => data[c], _channels: data }
    return b
  }
  startRendering() { return Promise.resolve(this.createBuffer(2, this.length, this.sampleRate)) }
}
global.AudioContext = class MockAudioContext {
  constructor() { this.sampleRate = 44100; this.destination = {} }
  createBufferSource() { return { buffer: null, connect: vi.fn().mockReturnThis(), start: vi.fn() } }
  createGain() { return { gain: { value: 1 }, connect: vi.fn().mockReturnThis() } }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len))
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (c) => data[c], _channels: data }
  }
  decodeAudioData(buf) { return Promise.resolve(this.createBuffer(2, 44100, 44100)) }
}

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
}))
