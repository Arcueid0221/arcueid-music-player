import type { PlayerState } from '../domain/types'

export interface MediaSessionControls {
  play(): Promise<void> | void
  pause(): void
  next(): Promise<void> | void
  previous(): Promise<void> | void
  stop(): void
  seek(seconds: number): void
  seekBy(seconds: number): void
}

type MetadataFactory = (init: MediaMetadataInit) => MediaMetadata

function defaultSession(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
}

function defaultMetadataFactory(): MetadataFactory | undefined {
  return typeof MediaMetadata === 'undefined' ? undefined : (init) => new MediaMetadata(init)
}

export class MediaSessionService {
  private static active?: MediaSessionService
  private readonly registeredActions = new Set<MediaSessionAction>()
  private trackKey?: string
  private controls?: MediaSessionControls

  constructor(
    private readonly session: MediaSession | null = defaultSession(),
    private readonly createMetadata: MetadataFactory | undefined = defaultMetadataFactory(),
  ) {}

  connect(controls: MediaSessionControls): () => void {
    this.controls = controls
    this.activate()
    return () => {
      if (MediaSessionService.active === this) {
        this.clearActions()
        MediaSessionService.active = undefined
      }
      this.controls = undefined
    }
  }

  private registerControls(controls: MediaSessionControls): void {
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => void controls.play()],
      ['pause', () => controls.pause()],
      ['previoustrack', () => void controls.previous()],
      ['nexttrack', () => void controls.next()],
      ['stop', () => controls.stop()],
      ['seekbackward', (details) => controls.seekBy(-(details.seekOffset ?? 10))],
      ['seekforward', (details) => controls.seekBy(details.seekOffset ?? 10)],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) controls.seek(details.seekTime)
      }],
    ]

    actions.forEach(([action, handler]) => this.setAction(action, handler))
  }

  update(state: PlayerState): void {
    if (!this.session) return
    if (state.isPlaying && this.controls) this.activate()
    if (MediaSessionService.active && MediaSessionService.active !== this) return
    MediaSessionService.active ??= this
    const song = state.playlist[state.currentIndex]
    const trackKey = song ? String(song.id) : undefined

    if (trackKey !== this.trackKey) {
      this.trackKey = trackKey
      this.session.metadata = song && this.createMetadata
        ? this.createMetadata({
            title: song.title,
            artist: song.artist || '未知艺术家',
            album: song.album || '',
            artwork: song.artwork,
          })
        : null
    }

    this.session.playbackState = song ? state.isPlaying ? 'playing' : 'paused' : 'none'
    if (state.duration <= 0 || !Number.isFinite(state.duration)) return

    try {
      this.session.setPositionState({
        duration: state.duration,
        playbackRate: 1,
        position: Math.min(Math.max(state.currentTime, 0), state.duration),
      })
    } catch {
      // Some Safari versions expose Media Session before position state.
    }
  }

  destroy(): void {
    if (MediaSessionService.active === this) {
      this.clearActions()
      MediaSessionService.active = undefined
    }
    if (!this.session) return
    this.session.metadata = null
    this.session.playbackState = 'none'
    this.trackKey = undefined
  }

  private activate(): void {
    if (!this.session || !this.controls || MediaSessionService.active === this) return
    MediaSessionService.active?.clearActions()
    MediaSessionService.active = this
    this.clearActions()
    this.registerControls(this.controls)
  }

  private setAction(action: MediaSessionAction, handler: MediaSessionActionHandler): void {
    if (!this.session) return
    try {
      this.session.setActionHandler(action, handler)
      this.registeredActions.add(action)
    } catch {
      // Browsers may expose Media Session but not every action.
    }
  }

  private clearActions(): void {
    if (!this.session) return
    this.registeredActions.forEach((action) => {
      try {
        this.session?.setActionHandler(action, null)
      } catch {
        // Ignore actions that disappeared after a browser lifecycle change.
      }
    })
    this.registeredActions.clear()
  }
}
