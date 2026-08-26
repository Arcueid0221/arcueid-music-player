import { AudioEngine } from './core/audio-engine'
import { PlayerController } from './core/player-controller'
import { createPlayerStore, type PlayerStore } from './core/player-store'
import { demoPlaylist } from './data/demo-playlist'
import type { PlayMode, Song } from './domain/types'
import { LyricRepository } from './services/lyric-repository'
import { MediaSessionService } from './services/media-session'
import { PlaybackMemory } from './services/playback-memory'
import styles from './ui/player.css?inline'
import { PlayerView } from './ui/player-view'

const PLAY_MODES: PlayMode[] = ['order', 'single', 'random']

export class ArcueidMusicPlayer extends HTMLElement {
  static readonly observedAttributes = ['play-mode', 'volume', 'remember-playback']

  private playerStore?: PlayerStore
  private controller?: PlayerController
  private view?: PlayerView
  private songs: Song[] = demoPlaylist

  get playlist(): Song[] {
    return [...this.songs]
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
      playMode,
      panel: this.hasAttribute('expanded') ? 'queue' : null,
      lyrics: [],
      activeLyricIndex: -1,
    })
    const engine = new AudioEngine()
    const controller = new PlayerController(
      store,
      engine,
      new LyricRepository(),
      new PlaybackMemory(this.hasAttribute('remember-playback'), this.getAttribute('memory-key') || undefined),
      new MediaSessionService(),
    )

    this.playerStore = store
    this.controller = controller
    this.view = new PlayerView(root, store, controller, engine)
    this.addEventListener('keydown', this.handleKeydown)
    controller.initialize()
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.handleKeydown)
    this.view?.destroy()
    this.controller?.destroy()
    this.view = undefined
    this.controller = undefined
    this.playerStore = undefined
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.controller) return
    if (name === 'play-mode' && newValue && PLAY_MODES.includes(newValue as PlayMode)) {
      this.controller.setPlayMode(newValue as PlayMode)
    }
    if (name === 'volume' && newValue !== null) this.controller.setVolume(this.readVolume())
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
