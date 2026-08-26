import type { PlayMode, PlayerPanel, Song } from '../domain/types'
import { findActiveLyric } from '../services/lyric-parser'
import { LyricRepository } from '../services/lyric-repository'
import { PlaybackMemory } from '../services/playback-memory'
import { nextIndex, previousIndex } from '../domain/playlist'
import { AudioEngine } from './audio-engine'
import type { PlayerStore } from './player-store'

export class PlayerController {
  private readonly cleanups: Array<() => void> = []
  private persistTimer?: number
  private lyricRequest = 0

  constructor(
    private readonly store: PlayerStore,
    private readonly engine: AudioEngine,
    private readonly lyrics: LyricRepository,
    private readonly memory: PlaybackMemory,
  ) {
    this.cleanups.push(
      engine.subscribe((snapshot) => {
        const state = store.getState()
        store.setState({
          ...snapshot,
          activeLyricIndex: findActiveLyric(state.lyrics, snapshot.currentTime * 1000),
        })
      }),
      engine.onEnded(() => void this.handleEnded()),
      store.subscribe((state) => this.schedulePersistence(state.playlist[state.currentIndex])),
    )
  }

  initialize(): void {
    const state = this.store.getState()
    if (state.playlist.length === 0) {
      this.store.setState({ error: '歌单为空', isLoading: false })
      return
    }

    const saved = this.memory.read()
    if (saved) {
      const savedIndex = state.playlist.findIndex((song) => song.id === saved.songId)
      this.store.setState({
        currentIndex: savedIndex >= 0 ? savedIndex : state.currentIndex,
        volume: saved.volume,
        muted: saved.muted,
        playMode: saved.playMode,
      })
      this.engine.setVolume(saved.volume)
      this.engine.setMuted(saved.muted)
    } else {
      this.engine.setVolume(state.volume)
      this.engine.setMuted(state.muted)
    }

    void this.loadCurrent(false, saved?.currentTime)
  }

  play(): Promise<void> {
    return this.engine.play()
  }

  pause(): void {
    this.engine.pause()
  }

  toggle(): Promise<void> | void {
    return this.store.getState().isPlaying ? this.pause() : this.play()
  }

  next(): Promise<void> {
    const state = this.store.getState()
    return this.select(nextIndex(state.playlist.length, state.currentIndex, state.playMode))
  }

  previous(): Promise<void> {
    const state = this.store.getState()
    return this.select(previousIndex(state.playlist.length, state.currentIndex, state.playMode))
  }

  async select(index: number, autoplay = true): Promise<void> {
    const state = this.store.getState()
    if (index < 0 || index >= state.playlist.length) return
    this.store.setState({ currentIndex: index, currentTime: 0, activeLyricIndex: -1 })
    await this.loadCurrent(autoplay)
  }

  seek(seconds: number): void {
    this.engine.seek(seconds)
  }

  seekRatio(ratio: number): void {
    this.seek(this.store.getState().duration * Math.min(Math.max(ratio, 0), 1))
  }

  setVolume(volume: number): void {
    const value = Math.min(Math.max(volume, 0), 1)
    this.engine.setVolume(value)
    this.store.setState({ volume: value, muted: value === 0 })
    this.engine.setMuted(value === 0)
  }

  toggleMuted(): void {
    const muted = !this.store.getState().muted
    this.engine.setMuted(muted)
    this.store.setState({ muted })
  }

  setPlayMode(playMode: PlayMode): void {
    this.store.setState({ playMode })
  }

  cyclePlayMode(): void {
    const modes: PlayMode[] = ['order', 'single', 'random']
    const current = this.store.getState().playMode
    this.setPlayMode(modes[(modes.indexOf(current) + 1) % modes.length])
  }

  togglePanel(panel: Exclude<PlayerPanel, null>): void {
    this.store.setState((state) => ({ panel: state.panel === panel ? null : panel }))
  }

  setPlaylist(playlist: Song[], currentIndex = 0): void {
    this.store.setState({
      playlist: [...playlist],
      currentIndex: Math.min(Math.max(currentIndex, 0), Math.max(playlist.length - 1, 0)),
      currentTime: 0,
      lyrics: [],
      activeLyricIndex: -1,
      error: playlist.length ? undefined : '歌单为空',
    })
    if (playlist.length) void this.loadCurrent(false)
  }

  destroy(): void {
    this.cleanups.forEach((cleanup) => cleanup())
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.lyrics.destroy()
    this.engine.destroy()
  }

  private async loadCurrent(autoplay: boolean, restoreTime = 0): Promise<void> {
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    if (!song) return

    const request = ++this.lyricRequest
    this.store.setState({ lyrics: [], activeLyricIndex: -1, error: undefined, isLoading: true })
    this.engine.load(song)
    if (restoreTime > 0) void this.engine.seekWhenReady(restoreTime)

    try {
      const lines = await this.lyrics.get(song)
      if (request === this.lyricRequest) this.store.setState({ lyrics: lines })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (request === this.lyricRequest) this.store.setState({ lyrics: [] })
    }

    if (autoplay && request === this.lyricRequest) await this.engine.play()
  }

  private async handleEnded(): Promise<void> {
    if (this.store.getState().playMode === 'single') {
      this.engine.seek(0)
      await this.engine.play()
      return
    }
    await this.next()
  }

  private schedulePersistence(song?: Song): void {
    if (!song) return
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.persistTimer = window.setTimeout(() => {
      const state = this.store.getState()
      this.memory.write({
        songId: song.id,
        currentTime: state.currentTime,
        volume: state.volume,
        muted: state.muted,
        playMode: state.playMode,
      })
    }, 400)
  }
}
