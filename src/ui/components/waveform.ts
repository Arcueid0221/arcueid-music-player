export class WaveformRenderer {
  private readonly context: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private frame?: number
  private hovering = false
  private getData: () => Uint8Array | null = () => null
  private getProgress: () => number = () => 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is unavailable')
    this.context = context
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  setHovering(hovering: boolean): void {
    this.hovering = hovering
    if (!this.frame) this.draw()
  }

  start(getData: () => Uint8Array | null, getProgress: () => number): void {
    this.getData = getData
    this.getProgress = getProgress
    if (this.frame) return
    const loop = (): void => {
      this.draw()
      this.frame = requestAnimationFrame(loop)
    }
    loop()
  }

  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.draw()
  }

  refresh(getProgress: () => number): void {
    this.getProgress = getProgress
    if (!this.frame) this.draw()
  }

  destroy(): void {
    this.stop()
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
    const progress = Math.min(Math.max(this.getProgress(), 0), 1)
    this.context.clearRect(0, 0, width, height)

    if (this.hovering) {
      this.drawProgressLine(width, height, progress)
      return
    }

    const data = this.getData()
    if (!data || data.every((value) => value === 0)) {
      this.drawProgressLine(width, height, progress)
      return
    }

    const barWidth = 3
    const gap = 3
    const count = Math.max(1, Math.floor(width / (barWidth + gap)))
    const step = Math.max(1, Math.floor(data.length / count))
    for (let index = 0; index < count; index += 1) {
      const value = data[index * step] ?? 0
      const barHeight = Math.max(3, (value / 255) * (height - 4))
      this.context.fillStyle = index / count <= progress ? '#6d4aff' : '#d7d2e3'
      this.context.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight)
    }
  }

  private drawProgressLine(width: number, height: number, progress: number): void {
    const y = height / 2
    this.context.lineWidth = 3
    this.context.lineCap = 'round'
    this.context.strokeStyle = '#d7d2e3'
    this.context.beginPath()
    this.context.moveTo(2, y)
    this.context.lineTo(width - 2, y)
    this.context.stroke()

    this.context.strokeStyle = '#6d4aff'
    this.context.beginPath()
    this.context.moveTo(2, y)
    this.context.lineTo(Math.max(2, progress * width), y)
    this.context.stroke()
  }
}
