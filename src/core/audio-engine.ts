import type { AudioSnapshot, Song } from '../domain/types'
import { BufferPlayback, decodedWindow } from './buffer-playback'
import { TrackCache } from './track-cache'

type SnapshotListener = (snapshot: AudioSnapshot) => void

export function resolveOutputGain(volume: number, muted: boolean): number {
  return muted ? 0 : Math.min(Math.max(volume, 0), 1)
}

export function resolveBufferedEnd(ranges: Pick<TimeRanges, 'length' | 'end'>, duration: number): number {
  let end = 0
  for (let index = 0; index < ranges.length; index += 1) end = Math.max(end, ranges.end(index))
  return Math.min(end, duration > 0 ? duration : end)
}

/**
 * WebKit (Safari on macOS and every browser on iOS) layers stale audio over
 * the new position after a seek once the element is routed through a
 * MediaElementAudioSourceNode, regardless of how the file is served. Native
 * output has no such overlap, so WebKit keeps the element unrouted.
 */
export function supportsWebAudioRouting(userAgent: string, maxTouchPoints = 0): boolean {
  const iOS = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (iOS) return false
  return !/AppleWebKit/.test(userAgent) || /Chrome|Chromium|Edg|OPR|Android/.test(userAgent)
}

function detectWebAudioRouting(): boolean {
  const nav = globalThis.navigator
  return nav ? supportsWebAudioRouting(nav.userAgent, nav.maxTouchPoints) : true
}

export interface AudioEngineOptions {
  /** Route the media element through Web Audio; defaults to false on WebKit. */
  webAudio?: boolean
  /** Download cache for in-memory playback when the element is not routed. */
  trackCache?: TrackCache
}

const TICK_INTERVAL = 250

export class AudioEngine {
  private readonly audio = new Audio()
  private readonly listeners = new Set<SnapshotListener>()
  private readonly endedListeners = new Set<() => void>()
  private audioContext?: AudioContext
  private analyser?: AnalyserNode
  private gain?: GainNode
  private source?: MediaElementAudioSourceNode
  private error?: string
  private loading = false
  private loadingTimer?: ReturnType<typeof setTimeout>
  private seeking = false
  private volume = 0.8
  private muted = false
  private readonly webAudio: boolean
  private readonly trackCache: TrackCache
  private song?: Song
  // WebKit only: once the track is decoded, playback moves from the media
  // element to a Web Audio buffer source, which seeks instantly.
  private playback?: BufferPlayback
  private ticker?: ReturnType<typeof setInterval>

  constructor(options: AudioEngineOptions = {}) {
    this.webAudio = options.webAudio ?? detectWebAudioRouting()
    this.trackCache = options.trackCache ?? new TrackCache({
      fetch: (url, init) => globalThis.fetch(url, init),
      decode: (data) => this.decode(data),
    })
    // Preloading the active track makes long-distance seeking less likely to
    // require a fresh range request. iOS may still limit preloading according
    // to its data-saving policy, so the UI also commits only one seek per drag.
    this.audio.preload = 'auto'
    this.audio.volume = this.volume

    this.audio.addEventListener('timeupdate', this.emit)
    this.audio.addEventListener('durationchange', this.emit)
    this.audio.addEventListener('loadedmetadata', this.emit)
    this.audio.addEventListener('loadeddata', this.emit)
    this.audio.addEventListener('progress', this.emit)
    this.audio.addEventListener('play', this.emit)
    this.audio.addEventListener('pause', this.emit)
    this.audio.addEventListener('waiting', this.handleWaiting)
    this.audio.addEventListener('stalled', this.handleWaiting)
    this.audio.addEventListener('seeking', this.handleSeeking)
    this.audio.addEventListener('seeked', this.handleSeeked)
    this.audio.addEventListener('playing', this.handlePlaying)
    this.audio.addEventListener('canplay', this.handlePlaying)
    this.audio.addEventListener('ended', this.handleEnded)
    this.audio.addEventListener('error', this.handleError)
  }

  load(song: Song): void {
    this.releasePlayback()
    this.clearLoadingTimer()
    this.seeking = false
    this.error = undefined
    this.loading = true
    if (song.crossOrigin === undefined) this.audio.removeAttribute('crossorigin')
    else this.audio.crossOrigin = song.crossOrigin
    this.song = song
    this.trackCache.retain(song.src)
    this.audio.src = song.src
    this.audio.load()
    this.emit()
    this.adoptDecodedTrack(0, false)
  }

  async play(): Promise<void> {
    try {
      await this.ensureAudioGraph()
      // Moving to the decoded track while paused is inaudible.
      if (!this.playback && this.audio.paused) this.adoptDecodedTrack(this.audio.currentTime, false)
      if (this.playback) {
        this.playback.play()
        this.startTicker()
        this.emit()
        return
      }
      this.prefetchCurrent()
      await this.audio.play()
    } catch {
      this.error = '播放未开始，请再次点击播放'
      this.emit()
    }
  }

  pause(): void {
    this.clearLoadingTimer()
    this.seeking = false
    this.loading = false
    if (this.playback) {
      this.playback.pause()
      this.stopTicker()
      this.emit()
      return
    }
    this.audio.pause()
  }

  stop(): void {
    this.clearLoadingTimer()
    this.seeking = false
    this.loading = false
    if (this.playback) {
      this.playback.stop()
      this.stopTicker()
      this.emit()
      return
    }
    this.audio.pause()
    this.audio.currentTime = 0
    this.emit()
  }

  clear(): void {
    this.releasePlayback()
    this.trackCache.destroy()
    this.song = undefined
    this.clearLoadingTimer()
    this.seeking = false
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.loading = false
    this.error = undefined
    this.emit()
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    const duration = this.duration
    const target = Math.min(Math.max(seconds, 0), duration || seconds)
    if (this.playback) {
      this.playback.seek(target)
      this.emit()
      return
    }
    // A seek already interrupts playback, so it is the inaudible moment to
    // move a playing track onto its decoded copy.
    if (this.adoptDecodedTrack(target, !this.audio.paused)) return
    const fastSeek = (this.audio as HTMLAudioElement & { fastSeek?: (time: number) => void }).fastSeek
    if (typeof fastSeek === 'function') fastSeek.call(this.audio, target)
    else this.audio.currentTime = target
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
    this.volume = Math.min(Math.max(volume, 0), 1)
    this.applyOutputGain()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyOutputGain()
  }

  get duration(): number {
    if (this.playback) return this.playback.duration
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  get currentTime(): number {
    return this.playback?.currentTime ?? this.audio.currentTime
  }

  get buffered(): number {
    if (this.playback) return this.playback.duration
    return resolveBufferedEnd(this.audio.buffered, this.duration)
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.hasAnalysedOutput()) return null
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  getTimeDomainData(): Uint8Array | null {
    if (!this.analyser || !this.hasAnalysedOutput()) {
      // A decoded track still waiting for its handover can feed the waveform
      // while the unrouted element keeps playing.
      const cached = this.song ? this.trackCache.matches(this.song.src) : undefined
      return cached ? decodedWindow(cached.track, this.audio.currentTime) : null
    }
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
    this.releasePlayback()
    this.trackCache.destroy()
    this.clearLoadingTimer()
    this.seeking = false
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    void this.audioContext?.close()
    this.listeners.clear()
    this.endedListeners.clear()
  }

  private snapshot(): AudioSnapshot {
    return {
      currentTime: this.currentTime,
      duration: this.duration,
      buffered: this.buffered,
      isPlaying: this.playback ? this.playback.isPlaying : !this.audio.paused,
      isLoading: this.playback ? false : this.loading,
      error: this.error,
    }
  }

  private readonly emit = (): void => {
    const snapshot = this.snapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private readonly handleWaiting = (): void => {
    if (this.seeking || this.loadingTimer) return
    // Safari can emit a very short waiting event while completing an already
    // buffered seek. Avoid flashing “载入中” unless the wait is observable.
    this.loadingTimer = globalThis.setTimeout(() => {
      this.loadingTimer = undefined
      if (this.audio.paused || this.audio.readyState >= this.audio.HAVE_FUTURE_DATA) return
      this.loading = true
      this.emit()
    }, 180)
  }

  private readonly handlePlaying = (): void => {
    this.clearLoadingTimer()
    this.seeking = false
    this.loading = false
    this.error = undefined
    this.emit()
  }

  private readonly handleSeeking = (): void => {
    this.seeking = true
    this.clearLoadingTimer()
    this.loading = false
    this.emit()
  }

  private readonly handleSeeked = (): void => {
    this.seeking = false
    if (!this.audio.paused && this.audio.readyState < this.audio.HAVE_FUTURE_DATA) {
      this.handleWaiting()
      return
    }
    this.loading = false
    this.emit()
  }

  private readonly handleEnded = (): void => {
    this.stopTicker()
    this.emit()
    this.endedListeners.forEach((listener) => listener())
  }

  private readonly handleError = (): void => {
    // The released element carries no source once the decoded track plays.
    if (this.playback) return
    this.clearLoadingTimer()
    this.seeking = false
    this.loading = false
    this.error = this.audio.error?.message || '音频加载失败'
    this.emit()
  }

  private hasAnalysedOutput(): boolean {
    return Boolean(this.source || this.playback)
  }

  private prefetchCurrent(): void {
    const song = this.song
    if (this.webAudio || !song || !this.audioContext) return
    void this.trackCache.prefetch(song).then((cached) => {
      if (cached && this.song === song && this.audio.paused) this.adoptDecodedTrack(this.audio.currentTime, false)
    })
  }

  private adoptDecodedTrack(position: number, resume: boolean): boolean {
    if (this.webAudio || this.playback || !this.song || !this.audioContext || !this.analyser) return false
    const cached = this.trackCache.matches(this.song.src)
    if (!cached) return false
    const playback = new BufferPlayback(this.audioContext, this.analyser, cached.track, this.handleEnded)
    playback.seek(position)
    this.playback = playback
    this.clearLoadingTimer()
    this.seeking = false
    this.loading = false
    // Release the element so it stops downloading and cannot play over the buffer.
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    if (resume) {
      playback.play()
      this.startTicker()
    }
    this.emit()
    return true
  }

  private releasePlayback(): void {
    this.stopTicker()
    this.playback?.stop()
    this.playback = undefined
  }

  private startTicker(): void {
    this.stopTicker()
    this.ticker = globalThis.setInterval(this.emit, TICK_INTERVAL)
  }

  private stopTicker(): void {
    if (this.ticker) globalThis.clearInterval(this.ticker)
    this.ticker = undefined
  }

  private async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('AudioContext unavailable')
    return this.audioContext.decodeAudioData(data)
  }

  private async ensureAudioGraph(): Promise<void> {
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext()
      } catch {
        return
      }
      this.analyser = this.audioContext.createAnalyser()
      this.gain = this.audioContext.createGain()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.78
      this.analyser.connect(this.gain)
      this.gain.connect(this.audioContext.destination)
      if (this.webAudio) {
        try {
          this.source = this.audioContext.createMediaElementSource(this.audio)
          this.source.connect(this.analyser)
        } catch {
          void this.audioContext.close()
          this.audioContext = undefined
          this.analyser = undefined
          this.gain = undefined
          this.source = undefined
          this.audio.volume = this.volume
          this.audio.muted = this.muted
          return
        }

        // Safari currently ignores HTMLMediaElement.volume for media routed
        // through an AudioContext, and iOS locks per-element media volume.
        // Keep the element at unity and attenuate the Web Audio output instead.
        this.audio.volume = 1
        this.audio.muted = false
      }
      this.applyOutputGain()
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume()
  }

  private applyOutputGain(): void {
    const output = resolveOutputGain(this.volume, this.muted)
    if (this.gain && this.audioContext) {
      this.gain.gain.cancelScheduledValues(this.audioContext.currentTime)
      this.gain.gain.setValueAtTime(output, this.audioContext.currentTime)
    }
    if (this.source) return

    // Native media volume remains the lightweight fallback before the audio
    // graph is created, and drives the unrouted element on WebKit.
    this.audio.volume = this.volume
    this.audio.muted = this.muted
  }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) globalThis.clearTimeout(this.loadingTimer)
    this.loadingTimer = undefined
  }
}
