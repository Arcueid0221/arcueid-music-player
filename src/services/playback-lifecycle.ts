export interface PlaybackLifecycleControls {
  persist(): void
  resume(): Promise<void> | void
}

interface VisibilityTarget extends EventTarget {
  readonly visibilityState?: DocumentVisibilityState
}

export class PlaybackLifecycleService {
  private playbackIntent = false
  private controls?: PlaybackLifecycleControls
  private resumePending = false

  constructor(
    private readonly visibilityTarget: VisibilityTarget | null = typeof document === 'undefined' ? null : document,
    private readonly pageTarget: EventTarget | null = typeof window === 'undefined' ? null : window,
  ) {}

  connect(controls: PlaybackLifecycleControls): () => void {
    this.controls = controls
    this.visibilityTarget?.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.pageTarget?.addEventListener('pagehide', this.handlePageHide)
    this.pageTarget?.addEventListener('pageshow', this.handlePageShow)
    return () => {
      this.visibilityTarget?.removeEventListener('visibilitychange', this.handleVisibilityChange)
      this.pageTarget?.removeEventListener('pagehide', this.handlePageHide)
      this.pageTarget?.removeEventListener('pageshow', this.handlePageShow)
      this.controls = undefined
    }
  }

  setPlaybackIntent(playing: boolean): void {
    this.playbackIntent = playing
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.visibilityTarget?.visibilityState === 'hidden') this.controls?.persist()
    if (this.visibilityTarget?.visibilityState === 'visible') this.resumeIfNeeded()
  }

  private readonly handlePageHide = (): void => {
    this.controls?.persist()
  }

  private readonly handlePageShow = (): void => {
    this.resumeIfNeeded()
  }

  private resumeIfNeeded(): void {
    if (!this.playbackIntent || this.resumePending || !this.controls) return
    this.resumePending = true
    Promise.resolve(this.controls.resume()).finally(() => {
      this.resumePending = false
    })
  }
}
