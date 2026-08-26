import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioSnapshot, PlayerState, Song } from '../domain/types'
import type { LyricRepository } from '../services/lyric-repository'
import type { MediaSessionService } from '../services/media-session'
import type { PlaybackLifecycleService } from '../services/playback-lifecycle'
import type { PlaybackMemory } from '../services/playback-memory'
import { AudioEngine } from './audio-engine'
import { PlayerController } from './player-controller'
import { createPlayerStore } from './player-store'

const songs: Song[] = [
  { id: 'one', title: 'One', src: '/one.mp3', lyrics: '[00:01.00]One' },
  { id: 'two', title: 'Two', src: '/two.mp3', lyrics: '[00:02.00]Two' },
]

function initialState(): PlayerState {
  return {
    playlist: [...songs],
    currentIndex: 0,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 0.8,
    muted: false,
    isPlaying: false,
    isLoading: false,
    isPlaylistLoading: false,
    canRetry: false,
    canSkip: false,
    playMode: 'order',
    panel: null,
    lyrics: [],
    activeLyricIndex: -1,
    lyricOffsetMs: 0,
  }
}

class FakeEngine {
  snapshot: AudioSnapshot = { currentTime: 0, duration: 100, buffered: 0, isPlaying: false, isLoading: false }
  listeners = new Set<(snapshot: AudioSnapshot) => void>()
  ended = new Set<() => void>()
  loaded: Song[] = []
  play = vi.fn(async () => {
    this.snapshot = { ...this.snapshot, isPlaying: true, isLoading: false, error: undefined }
    this.emit()
  })
  pause = vi.fn(() => {
    this.snapshot = { ...this.snapshot, isPlaying: false }
    this.emit()
  })
  stop = vi.fn()
  clear = vi.fn()
  seek = vi.fn()
  seekWhenReady = vi.fn(async () => undefined)
  setVolume = vi.fn()
  setMuted = vi.fn()

  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  onEnded(listener: () => void): () => void {
    this.ended.add(listener)
    return () => this.ended.delete(listener)
  }

  load(song: Song): void {
    this.loaded.push(song)
    this.snapshot = { ...this.snapshot, isPlaying: false, isLoading: true, error: undefined }
    this.emit()
  }

  fail(message = 'broken audio'): void {
    this.snapshot = { ...this.snapshot, isPlaying: false, isLoading: false, error: message }
    this.emit()
  }

  destroy(): void {}
  private emit(): void { this.listeners.forEach((listener) => listener(this.snapshot)) }
}

function setup() {
  const store = createPlayerStore(initialState())
  const engine = new FakeEngine()
  const lyrics = { get: vi.fn(async () => []), destroy: vi.fn() }
  const memory = { read: vi.fn(() => null), write: vi.fn() }
  const media = { connect: vi.fn(() => () => undefined), update: vi.fn(), destroy: vi.fn() }
  const lifecycle = {
    connect: vi.fn(() => () => undefined),
    setPlaybackIntent: vi.fn(),
    hasPlaybackIntent: vi.fn(() => false),
  }
  const controller = new PlayerController(
    store,
    engine as unknown as AudioEngine,
    lyrics as unknown as LyricRepository,
    memory as unknown as PlaybackMemory,
    media as unknown as MediaSessionService,
    lifecycle as unknown as PlaybackLifecycleService,
  )
  return { store, engine, controller }
}

describe('PlayerController', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps the active song attached while reordering and removing neighbors', async () => {
    const { store, controller } = setup()
    controller.initialize()
    await controller.select(1, false)
    controller.moveSong(1, 0)
    expect(store.getState().playlist[store.getState().currentIndex].id).toBe('two')
    await controller.removeSong(1)
    expect(store.getState().playlist[store.getState().currentIndex].id).toBe('two')
  })

  it('applies lyric offset when resolving the active line', () => {
    const { store, engine, controller } = setup()
    store.setState({ lyrics: [{ timeMs: 1_000, text: 'Line' }] })
    controller.setLyricOffset(500)
    engine.snapshot = { ...engine.snapshot, currentTime: 0.5 }
    ;(engine as unknown as { emit(): void }).emit()
    expect(store.getState().activeLyricIndex).toBe(0)
  })

  it('retries once and then skips a broken track', async () => {
    vi.useFakeTimers()
    const { store, engine, controller } = setup()
    controller.initialize()
    await controller.play()
    engine.fail()
    expect(store.getState().recoveryMessage).toContain('自动重试')

    await vi.advanceTimersByTimeAsync(500)
    expect(engine.loaded.filter((song) => song.id === 'one')).toHaveLength(2)
    engine.fail()
    expect(store.getState().canRetry).toBe(true)

    await vi.advanceTimersByTimeAsync(1_200)
    expect(store.getState().playlist[store.getState().currentIndex].id).toBe('two')
  })
})
