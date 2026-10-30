import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIOS, resolveBufferedEnd, resolveOutputGain, supportsWebAudioRouting } from './audio-engine'
import type { DecodedTrack } from './buffer-playback'
import { TrackCache } from './track-cache'

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

describe('supportsWebAudioRouting', () => {
  const agents = {
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
    androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    iPhoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    iPhoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    iPhoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  }

  it('keeps Web Audio routing on Blink and Gecko browsers', () => {
    expect(supportsWebAudioRouting(agents.macChrome)).toBe(true)
    expect(supportsWebAudioRouting(agents.macEdge)).toBe(true)
    expect(supportsWebAudioRouting(agents.macFirefox)).toBe(true)
    expect(supportsWebAudioRouting(agents.androidChrome, 5)).toBe(true)
  })

  it('uses native output on WebKit, including every iOS browser', () => {
    expect(supportsWebAudioRouting(agents.macSafari)).toBe(false)
    expect(supportsWebAudioRouting(agents.iPhoneSafari, 5)).toBe(false)
    expect(supportsWebAudioRouting(agents.iPhoneChrome, 5)).toBe(false)
    expect(supportsWebAudioRouting(agents.iPhoneFirefox, 5)).toBe(false)
  })

  it('tells iOS apart from desktop Safari for the decode size limit', () => {
    expect(isIOS(agents.iPhoneSafari, 5)).toBe(true)
    expect(isIOS(agents.iPhoneChrome, 5)).toBe(true)
    expect(isIOS(agents.macSafari, 0)).toBe(false)
    expect(isIOS(agents.macSafari, 5)).toBe(true)
  })

  it('treats iPadOS desktop-mode Safari as iOS', () => {
    expect(supportsWebAudioRouting(agents.macChrome.replace(/ Chrome\/[\d.]+/, ''), 5)).toBe(false)
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
      readyState = 4
      HAVE_FUTURE_DATA = 3
      error = null
      buffered = { length: 0, end: () => 0 }
      fastSeek = vi.fn((time: number) => { this.currentTime = time })

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
    const engine = new AudioEngine({ webAudio: true })
    engine.setVolume(0.35)
    await engine.play()
    expect(fakeGain.gain.value).toBe(0.35)

    engine.setMuted(true)
    expect(fakeGain.gain.value).toBe(0)
    engine.setMuted(false)
    expect(fakeGain.gain.value).toBe(0.35)

    engine.seek(42)

    const internals = engine as unknown as { audio: FakeAudio }
    expect(internals.audio.preload).toBe('auto')
    expect(internals.audio.fastSeek).toHaveBeenCalledWith(42)
    expect(internals.audio.currentTime).toBe(42)
    expect(internals.audio.volume).toBe(1)
    expect(internals.audio.muted).toBe(false)
    engine.destroy()
  })
})

describe('AudioEngine on WebKit', () => {
  afterEach(() => vi.unstubAllGlobals())

  class EventedAudio {
    preload = ''
    volume = 1
    muted = false
    paused = true
    duration = 300
    currentTime = 0
    readyState = 4
    HAVE_FUTURE_DATA = 3
    error = null
    src = ''
    crossOrigin: string | null = null
    buffered = { length: 0, end: () => 0 }

    addEventListener(): void {}
    removeAttribute(name: string): void { if (name === 'src') this.src = '' }
    load(): void {}
    pause(): void { this.paused = true }
    play = vi.fn(async () => { this.paused = false })
  }

  const decodedTrack: DecodedTrack = {
    duration: 300,
    sampleRate: 4,
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from({ length: 1200 }, (_, index) => (index % 2 ? 0.5 : -0.5)),
  }

  async function setup() {
    const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = []
    const connectable = () => ({ connect: vi.fn(), disconnect: vi.fn() })
    const context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createAnalyser: () => ({
        ...connectable(),
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0,
        getByteFrequencyData: vi.fn(),
        getByteTimeDomainData: vi.fn((data: Uint8Array) => data.fill(200)),
      }),
      createGain: () => ({ ...connectable(), gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() } }),
      createMediaElementSource: vi.fn(() => connectable()),
      createBufferSource: () => {
        const node = { ...connectable(), buffer: null, onended: null, start: vi.fn(), stop: vi.fn() }
        sources.push(node)
        return node
      },
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }
    vi.stubGlobal('Audio', EventedAudio)
    vi.stubGlobal('AudioContext', class { constructor() { return context } })

    const cache = new TrackCache({ fetch: async () => new Response(new Uint8Array(8)), decode: async () => decodedTrack })
    const { AudioEngine } = await import('./audio-engine')
    const engine = new AudioEngine({ webAudio: false, trackCache: cache })
    const audio = (engine as unknown as { audio: EventedAudio }).audio
    const song = { id: 1, title: 't', artist: 'a', src: 'https://cdn.test/t.mp3', crossOrigin: 'anonymous' as const }
    engine.load(song)
    return { engine, audio, cache, song, context, sources }
  }

  it('never routes the media element through Web Audio and keeps native volume', async () => {
    const { engine, audio, context } = await setup()
    engine.setVolume(0.35)
    await engine.play()
    engine.setMuted(true)
    expect(context.createMediaElementSource).not.toHaveBeenCalled()
    expect(audio.paused).toBe(false)
    expect(audio.volume).toBe(0.35)
    expect(audio.muted).toBe(true)
    engine.destroy()
  })

  it('streams first, then moves a playing track onto the decoded copy at the next seek', async () => {
    const { engine, audio, cache, song, sources } = await setup()
    await engine.play()
    await vi.waitFor(() => expect(cache.matches(song.src)).toBeDefined())
    expect(sources).toHaveLength(0)
    const snapshots: Array<{ currentTime: number; isPlaying: boolean }> = []
    engine.subscribe((snapshot) => snapshots.push(snapshot))

    engine.seek(120)
    expect(audio.paused).toBe(true)
    expect(audio.src).toBe('')
    expect(sources[0].start).toHaveBeenCalledWith(0, 120)
    expect(snapshots.at(-1)).toMatchObject({ currentTime: 120, isPlaying: true })

    engine.seek(30)
    expect(sources[0].stop).toHaveBeenCalled()
    expect(sources[1].start).toHaveBeenCalledWith(0, 30)
    engine.destroy()
  })

  it('moves a paused track onto the decoded copy as soon as it is ready', async () => {
    const { engine, audio, cache, song, sources } = await setup()
    await engine.play()
    audio.currentTime = 42
    engine.pause()
    await vi.waitFor(() => expect(cache.matches(song.src)).toBeDefined())
    await vi.waitFor(() => expect(audio.src).toBe(''))
    expect(engine.currentTime).toBe(42)

    await engine.play()
    expect(sources[0].start).toHaveBeenCalledWith(0, 42)
    expect(audio.play).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('draws the waveform from the decoded track before the handover, then from the analyser', async () => {
    const { engine, audio, cache, song } = await setup()
    await engine.play()
    expect(engine.getTimeDomainData()).toBeNull()
    await vi.waitFor(() => expect(cache.matches(song.src)).toBeDefined())
    audio.currentTime = 10
    expect(engine.getTimeDomainData()?.[0]).toBe(65)

    engine.seek(20)
    expect(engine.getTimeDomainData()?.[0]).toBe(200)
    engine.destroy()
  })

  it('reports the end of the decoded track and goes back to streaming on the next song', async () => {
    const { engine, audio, cache, song, sources } = await setup()
    const ended = vi.fn()
    engine.onEnded(ended)
    await engine.play()
    await vi.waitFor(() => expect(cache.matches(song.src)).toBeDefined())
    engine.seek(299)
    sources[0].onended?.()
    expect(ended).toHaveBeenCalledTimes(1)

    engine.load({ ...song, id: 2, src: 'https://cdn.test/next.mp3' })
    expect(audio.src).toBe('https://cdn.test/next.mp3')
    expect(cache.ready).toBeUndefined()
    expect(engine.currentTime).toBe(0)
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
