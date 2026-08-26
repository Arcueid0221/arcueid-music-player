import type { AudioEngine } from './audio-engine'

export interface AudioAnalysisFrame {
  samples: Uint8Array | null
  progress: number
}

type AnalysisListener = (frame: AudioAnalysisFrame) => void

export class AudioAnalysisSource {
  private readonly listeners = new Set<AnalysisListener>()
  private readonly frameInterval: number
  private animationFrame?: number
  private lastTimestamp = 0
  private lastSamples: Uint8Array | null = null

  constructor(private readonly engine: AudioEngine) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    this.frameInterval = reducedMotion ? 100 : 1000 / 30
  }

  subscribe(listener: AnalysisListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.animationFrame) return
    const loop = (timestamp: number): void => {
      if (timestamp - this.lastTimestamp >= this.frameInterval) {
        this.lastTimestamp = timestamp
        const samples = this.engine.getTimeDomainData()
        if (samples) this.lastSamples = samples
        this.emit()
      }
      this.animationFrame = requestAnimationFrame(loop)
    }
    this.animationFrame = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = undefined
    this.emit()
  }

  refresh(): void {
    this.emit()
  }

  destroy(): void {
    this.stop()
    this.listeners.clear()
  }

  private snapshot(): AudioAnalysisFrame {
    const progress = this.engine.duration > 0 ? this.engine.currentTime / this.engine.duration : 0
    return {
      samples: this.lastSamples,
      progress: Math.min(Math.max(progress, 0), 1),
    }
  }

  private emit(): void {
    const frame = this.snapshot()
    this.listeners.forEach((listener) => listener(frame))
  }
}
