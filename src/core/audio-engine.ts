import type { AudioSnapshot, Song } from '../domain/types'

type SnapshotListener = (snapshot: AudioSnapshot) => void

export class AudioEngine {
  private readonly audio = new Audio()
  private readonly listeners = new Set<SnapshotListener>()
  private readonly endedListeners = new Set<() => void>()
  private audioContext?: AudioContext
  private analyser?: AnalyserNode
  private source?: MediaElementAudioSourceNode
  private error?: string
  private loading = false

  constructor() {
    this.audio.preload = 'metadata'
    this.audio.volume = 0.8

    this.audio.addEventListener('timeupdate', this.emit)
    this.audio.addEventListener('durationchange', this.emit)
    this.audio.addEventListener('loadedmetadata', this.emit)
    this.audio.addEventListener('play', this.emit)
    this.audio.addEventListener('pause', this.emit)
    this.audio.addEventListener('waiting', this.handleWaiting)
    this.audio.addEventListener('playing', this.handlePlaying)
    this.audio.addEventListener('canplay', this.handlePlaying)
    this.audio.addEventListener('ended', this.handleEnded)
    this.audio.addEventListener('error', this.handleError)
  }

  load(song: Song): void {
    this.error = undefined
    this.loading = true
    this.audio.src = song.src
    this.audio.load()
    this.emit()
  }

  async play(): Promise<void> {
    await this.ensureAudioGraph()
    try {
      await this.audio.play()
    } catch {
      this.error = '播放未开始，请再次点击播放'
      this.emit()
    }
  }

  pause(): void {
    this.audio.pause()
  }

  stop(): void {
    this.audio.pause()
    this.audio.currentTime = 0
    this.emit()
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    const duration = this.duration
    this.audio.currentTime = Math.min(Math.max(seconds, 0), duration || seconds)
    this.emit()
  }

  async seekWhenReady(seconds: number): Promise<void> {
    if (this.duration > 0) {
      this.seek(seconds)
      return
    }
    await new Promise<void>((resolve) => {
      this.audio.addEventListener('loadedmetadata', () => {
        this.seek(seconds)
        resolve()
      }, { once: true })
    })
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.min(Math.max(volume, 0), 1)
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  getTimeDomainData(): Uint8Array | null {
    if (!this.analyser) return null
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    return data
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener)
    return () => this.endedListeners.delete(listener)
  }

  destroy(): void {
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    void this.audioContext?.close()
    this.listeners.clear()
    this.endedListeners.clear()
  }

  private snapshot(): AudioSnapshot {
    return {
      currentTime: this.audio.currentTime,
      duration: this.duration,
      isPlaying: !this.audio.paused,
      isLoading: this.loading,
      error: this.error,
    }
  }

  private readonly emit = (): void => {
    const snapshot = this.snapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private readonly handleWaiting = (): void => {
    this.loading = true
    this.emit()
  }

  private readonly handlePlaying = (): void => {
    this.loading = false
    this.error = undefined
    this.emit()
  }

  private readonly handleEnded = (): void => {
    this.endedListeners.forEach((listener) => listener())
  }

  private readonly handleError = (): void => {
    this.loading = false
    this.error = this.audio.error?.message || '音频加载失败'
    this.emit()
  }

  private async ensureAudioGraph(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.78
      this.source = this.audioContext.createMediaElementSource(this.audio)
      this.source.connect(this.analyser)
      this.analyser.connect(this.audioContext.destination)
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume()
  }
}
