import type { PlayMode, PlayerPanel, Song } from '../domain/types'
import { findActiveLyric } from '../services/lyric-parser'
import { LyricRepository } from '../services/lyric-repository'
import { PlaybackMemory } from '../services/playback-memory'
import { MediaSessionService } from '../services/media-session'
import { PlaybackLifecycleService } from '../services/playback-lifecycle'
import type { PlaylistProvider } from '../services/playlist-provider'
import {
  indexAfterMove,
  indexAfterRemoval,
  moveItem,
  nextIndex,
  previousIndex,
} from '../domain/playlist'
import { AudioEngine } from './audio-engine'
import type { PlayerStore } from './player-store'

export class PlayerController {
  private readonly cleanups: Array<() => void> = []
  private persistTimer?: number
  private lyricRequest = 0
  private playlistRequest?: AbortController

  constructor(
    private readonly store: PlayerStore,
    private readonly engine: AudioEngine,
    private readonly lyrics: LyricRepository,
    private readonly memory: PlaybackMemory,
    private readonly mediaSession: MediaSessionService,
    private readonly lifecycle: PlaybackLifecycleService,
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
      mediaSession.connect({
        play: () => this.play(),
        pause: () => this.pause(),
        next: () => this.next(),
        previous: () => this.previous(),
        stop: () => this.stop(),
        seek: (seconds) => this.seek(seconds),
        seekBy: (seconds) => this.seekBy(seconds),
      }),
      lifecycle.connect({
        persist: () => this.persistNow(),
        resume: () => this.play(),
      }),
      store.subscribe((state) => {
        this.schedulePersistence()
        this.mediaSession.update(state)
      }),
    )
    this.mediaSession.update(store.getState())
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
    this.lifecycle.setPlaybackIntent(true)
    return this.engine.play()
  }

  pause(): void {
    this.lifecycle.setPlaybackIntent(false)
    this.engine.pause()
  }

  stop(): void {
    this.lifecycle.setPlaybackIntent(false)
    this.engine.stop()
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
    this.store.setState({ currentIndex: index, currentTime: 0, buffered: 0, activeLyricIndex: -1 })
    await this.loadCurrent(autoplay)
  }

  seek(seconds: number): void {
    this.engine.seek(seconds)
  }

  seekRatio(ratio: number): void {
    this.seek(this.store.getState().duration * Math.min(Math.max(ratio, 0), 1))
  }

  seekBy(seconds: number): void {
    this.seek(this.store.getState().currentTime + seconds)
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
    this.lifecycle.setPlaybackIntent(false)
    this.store.setState({
      playlist: [...playlist],
      currentIndex: playlist.length
        ? Math.min(Math.max(currentIndex, 0), playlist.length - 1)
        : -1,
      currentTime: 0,
      buffered: 0,
      lyrics: [],
      activeLyricIndex: -1,
      isPlaylistLoading: false,
      playlistMessage: playlist.length ? `已载入 ${playlist.length} 首歌曲` : '歌单为空',
      error: playlist.length ? undefined : '歌单为空',
    })
    if (playlist.length) void this.loadCurrent(false)
    else this.engine.clear()
  }

  addSongs(songs: readonly Song[]): void {
    if (!songs.length) return
    const state = this.store.getState()
    const wasEmpty = state.playlist.length === 0
    this.store.setState({
      playlist: [...state.playlist, ...songs],
      currentIndex: wasEmpty ? 0 : state.currentIndex,
      error: undefined,
      playlistMessage: `已添加 ${songs.length} 首歌曲`,
    })
    if (wasEmpty) void this.loadCurrent(false)
  }

  async removeSong(index: number): Promise<void> {
    const state = this.store.getState()
    if (index < 0 || index >= state.playlist.length) return
    const removedCurrent = index === state.currentIndex
    const wasPlaying = state.isPlaying
    const playlist = state.playlist.filter((_, songIndex) => songIndex !== index)
    const currentIndex = indexAfterRemoval(state.currentIndex, index, playlist.length)

    if (!playlist.length) {
      this.lifecycle.setPlaybackIntent(false)
      this.engine.clear()
      this.store.setState({
        playlist,
        currentIndex,
        currentTime: 0,
        duration: 0,
        buffered: 0,
        isPlaying: false,
        isLoading: false,
        lyrics: [],
        activeLyricIndex: -1,
        error: '歌单为空',
        playlistMessage: '已移除最后一首歌曲',
      })
      return
    }

    this.store.setState({
      playlist,
      currentIndex,
      playlistMessage: '已从队列移除歌曲',
    })
    if (removedCurrent) await this.loadCurrent(wasPlaying)
  }

  moveSong(from: number, to: number): void {
    const state = this.store.getState()
    if (from < 0 || from >= state.playlist.length || to < 0 || to >= state.playlist.length || from === to) return
    this.store.setState({
      playlist: moveItem(state.playlist, from, to),
      currentIndex: indexAfterMove(state.currentIndex, from, to),
      playlistMessage: `已将歌曲移动到第 ${to + 1} 位`,
    })
  }

  async loadPlaylist(provider: PlaylistProvider, mode: 'replace' | 'append' = 'replace'): Promise<number> {
    this.playlistRequest?.abort()
    const request = new AbortController()
    this.playlistRequest = request
    this.store.setState({ isPlaylistLoading: true, playlistMessage: '正在读取歌单…' })
    try {
      const songs = await provider.load({ signal: request.signal })
      if (request.signal.aborted) return 0
      if (mode === 'append') this.addSongs(songs)
      else this.setPlaylist(songs)
      this.store.setState({
        isPlaylistLoading: false,
        playlistMessage: songs.length
          ? mode === 'append' ? `已添加 ${songs.length} 首歌曲` : `已载入 ${songs.length} 首歌曲`
          : '歌单为空',
      })
      return songs.length
    } catch (error) {
      if (request.signal.aborted) return 0
      const message = error instanceof Error ? error.message : '未知错误'
      this.store.setState({ isPlaylistLoading: false, playlistMessage: `歌单导入失败：${message}` })
      throw error
    } finally {
      if (this.playlistRequest === request) this.playlistRequest = undefined
    }
  }

  destroy(): void {
    this.cleanups.forEach((cleanup) => cleanup())
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.playlistRequest?.abort()
    this.lyrics.destroy()
    this.mediaSession.destroy()
    this.engine.destroy()
  }

  private async loadCurrent(autoplay: boolean, restoreTime = 0): Promise<void> {
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    if (!song) return

    const request = ++this.lyricRequest
    this.store.setState({ lyrics: [], activeLyricIndex: -1, buffered: 0, error: undefined, isLoading: true })
    this.engine.load(song)
    if (restoreTime > 0) void this.engine.seekWhenReady(restoreTime)

    try {
      const lines = await this.lyrics.get(song)
      if (request === this.lyricRequest) this.store.setState({ lyrics: lines })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (request === this.lyricRequest) this.store.setState({ lyrics: [] })
    }

    if (autoplay && request === this.lyricRequest) await this.play()
  }

  private async handleEnded(): Promise<void> {
    if (this.store.getState().playMode === 'single') {
      this.engine.seek(0)
      await this.play()
      return
    }
    await this.next()
  }

  private schedulePersistence(): void {
    const state = this.store.getState()
    if (!state.playlist[state.currentIndex]) return
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.persistTimer = window.setTimeout(() => this.persistNow(), 400)
  }

  private persistNow(): void {
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.persistTimer = undefined
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    if (!song) return
    this.memory.write({
      songId: song.id,
      currentTime: state.currentTime,
      volume: state.volume,
      muted: state.muted,
      playMode: state.playMode,
    })
  }
}
