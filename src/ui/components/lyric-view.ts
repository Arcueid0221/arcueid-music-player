import type { LyricLine, Song } from '../../domain/types'
import { findActiveWord } from '../../services/lyric-parser'

export class LyricView {
  private lines: LyricLine[] = []
  private elements: HTMLButtonElement[] = []
  private activeIndex = -1
  private activeWordIndex = -1
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  constructor(
    private readonly container: HTMLElement,
    private readonly onSeek: (seconds: number) => void,
  ) {}

  setLines(lines: LyricLine[], song?: Song): void {
    if (this.lines === lines) return
    this.lines = lines
    this.activeIndex = -1
    this.container.replaceChildren()

    if (lines.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty-state'
      const title = document.createElement('strong')
      title.textContent = song?.title ?? '当前歌曲'
      const message = document.createElement('span')
      message.textContent = '暂时没有可用的同步歌词'
      empty.append(title, message)
      this.container.append(empty)
      this.elements = []
      return
    }

    this.elements = lines.map((line) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `lyric-line ${line.kind === 'credit' ? 'is-credit' : ''}`
      if (line.words?.length) {
        line.words.forEach((word) => {
          const span = document.createElement('span')
          span.className = 'lyric-word'
          span.textContent = word.text
          button.append(span)
        })
      } else {
        button.textContent = line.text
      }
      button.addEventListener('click', () => this.onSeek(line.timeMs / 1000))
      this.container.append(button)
      return button
    })
  }

  setTime(timeMs: number): void {
    const wordIndex = findActiveWord(this.lines[this.activeIndex], timeMs)
    if (wordIndex === this.activeWordIndex) return
    const words = this.elements[this.activeIndex]?.querySelectorAll('.lyric-word')
    words?.forEach((word, index) => word.classList.toggle('is-active', index <= wordIndex))
    this.activeWordIndex = wordIndex
  }

  setActive(index: number): void {
    if (index === this.activeIndex) return
    this.elements[this.activeIndex]?.classList.remove('is-active')
    this.activeIndex = index
    this.activeWordIndex = -1
    const current = this.elements[index]
    current?.classList.add('is-active')
    current?.scrollIntoView({ block: 'center', behavior: this.reducedMotion ? 'auto' : 'smooth' })
  }
}
