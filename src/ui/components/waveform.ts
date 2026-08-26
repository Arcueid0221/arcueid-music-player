import type { AudioAnalysisFrame } from '../../core/audio-analysis-source'

const FALLBACK_AMPLITUDES = [0.08, 0.11, 0.07, 0.13, 0.09, 0.06]

export function sampleAmplitudes(samples: Uint8Array | null, count: number): number[] {
  if (count <= 0) return []
  if (!samples || samples.length < 2) {
    return Array.from({ length: count }, (_, index) => FALLBACK_AMPLITUDES[index % FALLBACK_AMPLITUDES.length])
  }

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * samples.length) / count)
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / count))
    let peak = 0
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      peak = Math.max(peak, Math.abs((samples[sampleIndex] ?? 128) - 128) / 128)
    }
    return Math.max(0.06, Math.min(peak, 1))
  })
}

interface WaveformOptions {
  compact?: boolean
}

export class WaveformRenderer {
  private readonly context: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private readonly compact: boolean
  private frame: AudioAnalysisFrame = { samples: null, progress: 0, bufferedProgress: 0 }
  private pointerRatio: number | null = null

  constructor(private readonly canvas: HTMLCanvasElement, options: WaveformOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is unavailable')
    this.context = context
    this.compact = options.compact ?? false
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  update(frame: AudioAnalysisFrame): void {
    this.frame = frame
    this.draw()
  }

  setPointerRatio(ratio: number | null): void {
    this.pointerRatio = ratio === null ? null : Math.min(Math.max(ratio, 0), 1)
    this.draw()
  }

  destroy(): void {
    this.resizeObserver.disconnect()
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio))
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio))
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.draw()
  }

  private draw(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return

    const barWidth = this.compact ? 2 : 3
    const preferredGap = 3
    const count = Math.max(2, Math.floor((width + preferredGap) / (barWidth + preferredGap)))
    const amplitudes = sampleAmplitudes(this.frame.samples, count)
    const progress = Math.min(Math.max(this.frame.progress, 0), 1)
    const bufferedProgress = Math.min(Math.max(this.frame.bufferedProgress, progress), 1)

    this.context.clearRect(0, 0, width, height)
    this.drawCenterLine(width, height)
    this.drawBars(amplitudes, width, height, barWidth, this.color('--player-wave-idle', '#e7e3eb'))

    this.context.save()
    this.context.beginPath()
    this.context.rect(0, 0, bufferedProgress * width, height)
    this.context.clip()
    this.drawBars(amplitudes, width, height, barWidth, this.color('--player-wave-buffered', '#d2ccdc'))
    this.context.restore()

    this.context.save()
    this.context.beginPath()
    this.context.rect(0, 0, progress * width, height)
    this.context.clip()
    this.drawBars(amplitudes, width, height, barWidth, this.color('--player-accent', '#6d4aff'))
    this.context.restore()

    if (this.pointerRatio !== null && !this.compact) this.drawPointer(width, height, this.pointerRatio)
  }

  private drawCenterLine(width: number, height: number): void {
    this.context.lineWidth = this.compact ? 1 : 1.5
    this.context.strokeStyle = this.compact
      ? 'rgba(109, 74, 255, 0.18)'
      : this.color('--player-wave-center', '#e6e1ec')
    this.context.beginPath()
    this.context.moveTo(0, height / 2)
    this.context.lineTo(width, height / 2)
    this.context.stroke()
  }

  private drawBars(amplitudes: number[], width: number, height: number, barWidth: number, color: string): void {
    const availableHeight = Math.max(1, height - (this.compact ? 4 : 8))
    const minimumHeight = this.compact ? 2 : 4
    this.context.fillStyle = color

    amplitudes.forEach((amplitude, index) => {
      const x = amplitudes.length === 1 ? 0 : (index * (width - barWidth)) / (amplitudes.length - 1)
      const barHeight = Math.min(availableHeight, minimumHeight + Math.sqrt(amplitude) * (availableHeight - minimumHeight))
      this.context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight)
    })
  }

  private drawPointer(width: number, height: number, ratio: number): void {
    const x = ratio * width
    this.context.strokeStyle = this.color('--player-pointer', '#2d2738')
    this.context.lineWidth = 1
    this.context.beginPath()
    this.context.moveTo(x, 3)
    this.context.lineTo(x, height - 3)
    this.context.stroke()
    this.context.fillStyle = '#ffffff'
    this.context.beginPath()
    this.context.arc(x, height / 2, 4, 0, Math.PI * 2)
    this.context.fill()
    this.context.strokeStyle = this.color('--player-accent', '#6d4aff')
    this.context.stroke()
  }

  private color(token: string, fallback: string): string {
    return getComputedStyle(this.canvas).getPropertyValue(token).trim() || fallback
  }
}
