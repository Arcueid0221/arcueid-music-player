import type { LyricLine } from '../../domain/types'

export class LyricView {
  private lines: LyricLine[] = []
  private elements: HTMLButtonElement[] = []
  private activeIndex = -1
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  constructor(
    private readonly container: HTMLElement,
    private readonly onSeek: (seconds: number) => void,
  ) {}

  setLines(lines: LyricLine[]): void {
    if (this.lines === lines) return
    this.lines = lines
    this.activeIndex = -1
    this.container.replaceChildren()

    if (lines.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty-state'
      empty.textContent = '这首歌暂时没有可用歌词'
      this.container.append(empty)
      this.elements = []
      return
    }

    this.elements = lines.map((line) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `lyric-line ${line.kind === 'credit' ? 'is-credit' : ''}`
      button.textContent = line.text
      button.addEventListener('click', () => this.onSeek(line.timeMs / 1000))
      this.container.append(button)
      return button
    })
  }

  setActive(index: number): void {
    if (index === this.activeIndex) return
    this.elements[this.activeIndex]?.classList.remove('is-active')
    this.activeIndex = index
    const current = this.elements[index]
    current?.classList.add('is-active')
    current?.scrollIntoView({ block: 'center', behavior: this.reducedMotion ? 'auto' : 'smooth' })
  }
}
