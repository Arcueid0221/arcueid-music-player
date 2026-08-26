import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBufferedEnd, resolveOutputGain } from './audio-engine'

describe('resolveOutputGain', () => {
  it('uses the selected volume while audible', () => {
    expect(resolveOutputGain(0.45, false)).toBe(0.45)
  })

  it('uses zero gain while muted without losing the selected volume', () => {
    expect(resolveOutputGain(0.45, true)).toBe(0)
    expect(resolveOutputGain(0.45, false)).toBe(0.45)
  })

  it('clamps invalid volume ranges', () => {
    expect(resolveOutputGain(-1, false)).toBe(0)
    expect(resolveOutputGain(2, false)).toBe(1)
  })
})

describe('AudioEngine output graph', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('routes volume and mute through GainNode after playback starts', async () => {
    class FakeAudio {
      preload = ''
      volume = 1
      muted = false
      paused = true
      duration = 100
      currentTime = 0
      error = null

      addEventListener(): void {}
      removeAttribute(): void {}
      load(): void {}
      pause(): void { this.paused = true }
      async play(): Promise<void> { this.paused = false }
    }

    class FakeAudioParam {
      value = 1
      cancelScheduledValues(): void {}
      setValueAtTime(value: number): void { this.value = value }
    }

    const connectable = () => ({ connect: vi.fn() })
    const fakeGain = { ...connectable(), gain: new FakeAudioParam() }
    const fakeAnalyser = {
      ...connectable(),
      fftSize: 128,
      frequencyBinCount: 64,
      smoothingTimeConstant: 0,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    }
    const fakeContext = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createAnalyser: () => fakeAnalyser,
      createGain: () => fakeGain,
      createMediaElementSource: () => connectable(),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }

    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('AudioContext', class { constructor() { return fakeContext } })

    const { AudioEngine } = await import('./audio-engine')
    const engine = new AudioEngine()
    engine.setVolume(0.35)
    await engine.play()
    expect(fakeGain.gain.value).toBe(0.35)

    engine.setMuted(true)
    expect(fakeGain.gain.value).toBe(0)
    engine.setMuted(false)
    expect(fakeGain.gain.value).toBe(0.35)

    const internals = engine as unknown as { audio: FakeAudio }
    expect(internals.audio.preload).toBe('auto')
    expect(internals.audio.volume).toBe(1)
    expect(internals.audio.muted).toBe(false)
    engine.destroy()
  })
})

describe('resolveBufferedEnd', () => {
  it('uses the furthest buffered range without exceeding duration', () => {
    const ranges = {
      length: 2,
      end: (index: number) => [18, 72][index] ?? 0,
    }
    expect(resolveBufferedEnd(ranges, 100)).toBe(72)
    expect(resolveBufferedEnd(ranges, 60)).toBe(60)
  })

  it('returns zero when nothing is buffered', () => {
    expect(resolveBufferedEnd({ length: 0, end: () => 0 }, 100)).toBe(0)
  })
})
