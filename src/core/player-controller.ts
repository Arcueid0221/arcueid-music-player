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
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private readonly retryAttempts = new Map<string, number>()
  private readonly failedTracks = new Set<string>()
  private lastEngineError?: string
  private playbackIntent = false

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
          // Error recovery augments the raw engine error with retry/skip
          // actions. Preserve the settled error until handlePlaybackError()
          // publishes the complete public state in one update.
          error: snapshot.error ? state.error : undefined,
          activeLyricIndex: findActiveLyric(state.lyrics, snapshot.currentTime * 1000 + state.lyricOffsetMs),
        })
        if (snapshot.error && snapshot.error !== this.lastEngineError) {
          this.lastEngineError = snapshot.error
          this.handlePlaybackError(snapshot.error)
        }
        if (!snapshot.error) this.lastEngineError = undefined
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
    this.playbackIntent = true
    this.lifecycle.setPlaybackIntent(true)
    return this.engine.play()
  }

  pause(): void {
    this.playbackIntent = false
    this.lifecycle.setPlaybackIntent(false)
    this.engine.pause()
  }

  stop(): void {
    this.playbackIntent = false
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
    const song = state.playlist[index]
    this.failedTracks.delete(String(song.id))
    this.retryAttempts.delete(String(song.id))
    this.store.setState({ currentIndex: index, currentTime: 0, buffered: 0, activeLyricIndex: -1, lyricOffsetMs: 0 })
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

  setLyricOffset(offsetMs: number): void {
    const lyricOffsetMs = Math.min(Math.max(Math.trunc(offsetMs), -30_000), 30_000)
    const state = this.store.getState()
    this.store.setState({
      lyricOffsetMs,
      activeLyricIndex: findActiveLyric(state.lyrics, state.currentTime * 1000 + lyricOffsetMs),
    })
  }

  retry(): Promise<void> {
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    if (!song) return Promise.resolve()
    this.clearRecoveryTimer()
    this.failedTracks.delete(String(song.id))
    this.retryAttempts.delete(String(song.id))
    this.store.setState({ error: undefined, recoveryMessage: '正在重新载入当前歌曲…', canRetry: false, canSkip: false })
    return this.loadCurrent(this.playbackIntent)
  }

  skipFailed(): Promise<void> {
    this.clearRecoveryTimer()
    return this.skipFailedTrack()
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
    this.failedTracks.clear()
    this.retryAttempts.clear()
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
      lyricOffsetMs: 0,
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
        lyricOffsetMs: 0,
        error: '歌单为空',
        playlistMessage: '已移除最后一首歌曲',
      })
      return
    }

    this.store.setState({
      playlist,
      currentIndex,
      lyricOffsetMs: removedCurrent ? 0 : state.lyricOffsetMs,
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
    if (this.persistTimer) globalThis.clearTimeout(this.persistTimer)
    this.clearRecoveryTimer()
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
    this.clearRecoveryTimer()
    this.store.setState({
      lyrics: [],
      activeLyricIndex: -1,
      buffered: 0,
      error: undefined,
      recoveryMessage: undefined,
      canRetry: false,
      canSkip: false,
      isLoading: true,
    })
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
    if (this.persistTimer) globalThis.clearTimeout(this.persistTimer)
    this.persistTimer = globalThis.setTimeout(() => this.persistNow(), 400)
  }

  private handlePlaybackError(error: string): void {
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    if (!song) return
    const key = String(song.id)
    const attempt = this.retryAttempts.get(key) ?? 0
    this.clearRecoveryTimer()

    if (attempt < 1) {
      this.retryAttempts.set(key, attempt + 1)
      this.store.setState({
        error,
        recoveryMessage: '音频加载失败，正在自动重试（1/1）…',
        canRetry: false,
        canSkip: state.playlist.length > 1,
      })
      this.recoveryTimer = globalThis.setTimeout(() => {
        void this.loadCurrent(this.playbackIntent)
      }, 500)
      return
    }

    this.failedTracks.add(key)
    this.store.setState({
      error,
      recoveryMessage: state.playlist.length > 1
        ? '重试失败，即将跳过这首歌曲。'
        : '重试失败，请检查音频地址或跨域设置。',
      canRetry: true,
      canSkip: state.playlist.length > 1,
    })
    if (state.playlist.length > 1) {
      this.recoveryTimer = globalThis.setTimeout(() => void this.skipFailedTrack(), 1_200)
    }
  }

  private async skipFailedTrack(): Promise<void> {
    const state = this.store.getState()
    for (let offset = 1; offset <= state.playlist.length; offset += 1) {
      const index = (state.currentIndex + offset) % state.playlist.length
      if (!this.failedTracks.has(String(state.playlist[index].id))) {
        this.store.setState({ recoveryMessage: `已跳过无法播放的歌曲，正在载入 ${state.playlist[index].title}…` })
        await this.select(index, this.playbackIntent)
        return
      }
    }
    this.playbackIntent = false
    this.lifecycle.setPlaybackIntent(false)
    this.engine.pause()
    this.store.setState({
      isPlaying: false,
      isLoading: false,
      error: '歌单中的歌曲均无法播放',
      recoveryMessage: '请检查音频地址、网络或 CORS 响应头。',
      canRetry: true,
      canSkip: false,
    })
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) globalThis.clearTimeout(this.recoveryTimer)
    this.recoveryTimer = undefined
  }

  private persistNow(): void {
    if (this.persistTimer) globalThis.clearTimeout(this.persistTimer)
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
