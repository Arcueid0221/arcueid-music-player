import type { AudioAnalysisFrame } from '../../core/audio-analysis-source'
import type { PlayerState } from '../../domain/types'
import { WaveformRenderer } from './waveform'

export function getNowPlayingText(state: PlayerState): string {
  const lyric = state.lyrics[state.activeLyricIndex]
  if (lyric?.text) return lyric.text
  const song = state.playlist[state.currentIndex]
  return song ? [song.title, song.artist].filter(Boolean).join(' · ') : '等待添加歌曲'
}

export class NowPlayingRail {
  private readonly waveform: WaveformRenderer
  private readonly text: HTMLElement
  private lastText = ''

  constructor(private readonly button: HTMLButtonElement, canvas: HTMLCanvasElement) {
    const text = button.querySelector<HTMLElement>('.now-playing-text')
    if (!text) throw new Error('Missing now-playing text')
    this.text = text
    this.waveform = new WaveformRenderer(canvas, { compact: true })
  }

  setState(state: PlayerState): void {
    const text = getNowPlayingText(state)
    if (text !== this.lastText) {
      this.text.textContent = text
      this.lastText = text
    }
    const expanded = state.panel === 'lyrics'
    this.button.classList.toggle('is-active', expanded)
    this.button.setAttribute('aria-expanded', String(expanded))
    this.button.setAttribute('aria-label', expanded ? '收起当前歌词' : '显示当前歌词')
    this.button.title = expanded ? '收起当前歌词' : '显示当前歌词'
  }

  update(frame: AudioAnalysisFrame): void {
    this.waveform.update(frame)
  }

  destroy(): void {
    this.waveform.destroy()
  }
}
