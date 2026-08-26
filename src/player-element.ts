import { AudioEngine } from './core/audio-engine'
import { PlayerController } from './core/player-controller'
import { createPlayerStore, type PlayerStore } from './core/player-store'
import { demoPlaylist } from './data/demo-playlist'
import type { PlayMode, PlayerState, PlayerTheme, Song } from './domain/types'
import { LyricRepository } from './services/lyric-repository'
import { MediaSessionService } from './services/media-session'
import { PlaybackLifecycleService } from './services/playback-lifecycle'
import { PlaybackMemory } from './services/playback-memory'
import {
  ArrayPlaylistProvider,
  JsonPlaylistProvider,
  type PlaylistProvider,
} from './services/playlist-provider'
import styles from './ui/player.css?inline'
import { PlayerView } from './ui/player-view'

const PLAY_MODES: PlayMode[] = ['order', 'single', 'random']
const PLAYER_THEMES: PlayerTheme[] = ['light', 'dark', 'system']
const HTMLElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement

export class ArcueidMusicPlayer extends HTMLElementBase {
  static readonly observedAttributes = ['play-mode', 'volume', 'remember-playback', 'playlist-src', 'theme']

  private playerStore?: PlayerStore
  private controller?: PlayerController
  private view?: PlayerView
  private publicEventsCleanup?: () => void
  private readonly themeMedia = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')
  private songs: Song[] = demoPlaylist

  get playlist(): Song[] {
    return [...(this.playerStore?.getState().playlist ?? this.songs)]
  }

  set playlist(value: Song[]) {
    this.songs = Array.isArray(value) ? [...value] : []
    this.controller?.setPlaylist(this.songs)
  }

  connectedCallback(): void {
    if (this.controller) return
    this.tabIndex = this.tabIndex >= 0 ? this.tabIndex : 0
    this.setAttribute('role', 'region')
    this.setAttribute('aria-label', 'Arcueid 音乐播放器')
    this.applyTheme()
    this.themeMedia?.addEventListener('change', this.handleThemeChange)

    const playMode = this.readPlayMode()
    const volume = this.readVolume()
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()
    const style = document.createElement('style')
    style.textContent = styles
    root.append(style)

    const store = createPlayerStore({
      playlist: [...this.songs],
      currentIndex: 0,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume,
      muted: volume === 0,
      isPlaying: false,
      isLoading: false,
      isPlaylistLoading: false,
      canRetry: false,
      canSkip: false,
      playMode,
      panel: this.hasAttribute('expanded') ? 'queue' : null,
      lyrics: [],
      activeLyricIndex: -1,
      lyricOffsetMs: 0,
    })
    const engine = new AudioEngine()
    const controller = new PlayerController(
      store,
      engine,
      new LyricRepository(),
      new PlaybackMemory(this.hasAttribute('remember-playback'), this.getAttribute('memory-key') || undefined),
      new MediaSessionService(),
      new PlaybackLifecycleService(),
    )

    this.playerStore = store
    this.controller = controller
    this.view = new PlayerView(root, store, controller, engine)
    this.publicEventsCleanup = store.subscribe((state, previous) => this.emitPublicEvents(state, previous))
    this.addEventListener('keydown', this.handleKeydown)
    controller.initialize()
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('ready', { composed: true })))
    const playlistSrc = this.getAttribute('playlist-src')
    if (playlistSrc) void controller.loadPlaylist(new JsonPlaylistProvider(playlistSrc)).catch(() => undefined)
  }

  disconnectedCallback(): void {
    if (this.playerStore) this.songs = [...this.playerStore.getState().playlist]
    this.removeEventListener('keydown', this.handleKeydown)
    this.themeMedia?.removeEventListener('change', this.handleThemeChange)
    this.publicEventsCleanup?.()
    this.view?.destroy()
    this.controller?.destroy()
    this.view = undefined
    this.controller = undefined
    this.playerStore = undefined
    this.publicEventsCleanup = undefined
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.controller) return
    if (name === 'play-mode' && newValue && PLAY_MODES.includes(newValue as PlayMode)) {
      this.controller.setPlayMode(newValue as PlayMode)
    }
    if (name === 'volume' && newValue !== null) this.controller.setVolume(this.readVolume())
    if (name === 'playlist-src' && newValue) {
      void this.controller.loadPlaylist(new JsonPlaylistProvider(newValue)).catch(() => undefined)
    }
    if (name === 'theme') this.applyTheme()
  }

  play(): Promise<void> {
    return this.controller?.play() ?? Promise.resolve()
  }

  pause(): void {
    this.controller?.pause()
  }

  stop(): void {
    this.controller?.stop()
  }

  toggle(): Promise<void> | void {
    return this.controller?.toggle()
  }

  next(): Promise<void> {
    return this.controller?.next() ?? Promise.resolve()
  }

  previous(): Promise<void> {
    return this.controller?.previous() ?? Promise.resolve()
  }

  select(index: number): Promise<void> {
    return this.controller?.select(index) ?? Promise.resolve()
  }

  seek(seconds: number): void {
    this.controller?.seek(seconds)
  }

  seekBy(seconds: number): void {
    this.controller?.seekBy(seconds)
  }

  setVolume(volume: number): void {
    this.controller?.setVolume(volume)
  }

  mute(): void {
    this.controller?.toggleMuted()
  }

  setPlayMode(mode: PlayMode): void {
    this.controller?.setPlayMode(mode)
  }

  setTheme(theme: PlayerTheme): void {
    this.setAttribute('theme', PLAYER_THEMES.includes(theme) ? theme : 'system')
  }

  setLyricOffset(offsetMs: number): void {
    this.controller?.setLyricOffset(offsetMs)
  }

  retry(): Promise<void> {
    return this.controller?.retry() ?? Promise.resolve()
  }

  skipFailed(): Promise<void> {
    return this.controller?.skipFailed() ?? Promise.resolve()
  }

  async loadPlaylist(provider: PlaylistProvider, mode: 'replace' | 'append' = 'replace'): Promise<number> {
    if (this.controller) return this.controller.loadPlaylist(provider, mode)
    const songs = await provider.load()
    this.songs = mode === 'append' ? [...this.songs, ...songs] : [...songs]
    return songs.length
  }

  addSongs(songs: readonly Song[]): void {
    if (!this.controller) {
      this.songs.push(...songs)
      return
    }
    this.controller.addSongs(songs)
  }

  removeSong(index: number): Promise<void> {
    return this.controller?.removeSong(index) ?? Promise.resolve()
  }

  moveSong(from: number, to: number): void {
    this.controller?.moveSong(from, to)
  }

  usePlaylist(songs: readonly Song[], mode: 'replace' | 'append' = 'replace'): Promise<number> {
    return this.loadPlaylist(new ArrayPlaylistProvider(songs), mode)
  }

  getState() {
    return this.playerStore?.getState()
  }

  private readPlayMode(): PlayMode {
    const mode = this.getAttribute('play-mode') as PlayMode | null
    return mode && PLAY_MODES.includes(mode) ? mode : 'order'
  }

  private readVolume(): number {
    const value = Number(this.getAttribute('volume') ?? 0.8)
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.8
  }

  private applyTheme(): void {
    const requested = this.getAttribute('theme') as PlayerTheme | null
    const theme = requested && PLAYER_THEMES.includes(requested) ? requested : 'system'
    const resolved = theme === 'system' ? this.themeMedia?.matches ? 'dark' : 'light' : theme
    this.dataset.resolvedTheme = resolved
  }

  private emitPublicEvents(state: PlayerState, previous: PlayerState): void {
    const song = state.playlist[state.currentIndex]
    const previousSong = previous.playlist[previous.currentIndex]
    if (song?.id !== previousSong?.id) {
      this.dispatchEvent(new CustomEvent('trackchange', {
        bubbles: true,
        composed: true,
        detail: { song, previousSong, index: state.currentIndex },
      }))
    }
    if (state.isPlaying !== previous.isPlaying || state.isLoading !== previous.isLoading) {
      this.dispatchEvent(new CustomEvent('playbackchange', {
        bubbles: true,
        composed: true,
        detail: {
          isPlaying: state.isPlaying,
          isLoading: state.isLoading,
          currentTime: state.currentTime,
          duration: state.duration,
        },
      }))
    }
    if (state.error && state.error !== previous.error) {
      this.dispatchEvent(new CustomEvent('error', {
        // Match the platform's non-bubbling error-event convention so an
        // element-level playback error is not mistaken for a window error.
        bubbles: false,
        composed: true,
        detail: { message: state.error, song, canRetry: state.canRetry, canSkip: state.canSkip },
      }))
    }
  }

  private readonly handleThemeChange = (): void => this.applyTheme()

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return
    if (event.code === 'Space') {
      event.preventDefault()
      void this.controller?.toggle()
    }
    if (event.code === 'ArrowRight') this.controller?.seek((this.playerStore?.getState().currentTime ?? 0) + 5)
    if (event.code === 'ArrowLeft') this.controller?.seek((this.playerStore?.getState().currentTime ?? 0) - 5)
    if (event.code === 'ArrowUp') this.controller?.setVolume((this.playerStore?.getState().volume ?? 0.8) + 0.05)
    if (event.code === 'ArrowDown') this.controller?.setVolume((this.playerStore?.getState().volume ?? 0.8) - 0.05)
  }
}
