import type { LyricLine, Song } from '../domain/types'
import { parseLrc } from './lyric-parser'

export class LyricRepository {
  private readonly cache = new Map<string | number, LyricLine[]>()
  private controller?: AbortController

  async get(song: Song): Promise<LyricLine[]> {
    this.controller?.abort()
    const cached = this.cache.get(song.id)
    if (cached) return cached

    let lines: LyricLine[] = []
    if (Array.isArray(song.lyrics)) {
      lines = song.lyrics
    } else if (typeof song.lyrics === 'string') {
      lines = parseLrc(song.lyrics)
    } else if (song.lyricsUrl) {
      const controller = new AbortController()
      this.controller = controller
      const response = await fetch(song.lyricsUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`歌词加载失败（${response.status}）`)
      lines = parseLrc(await response.text())
    }

    this.cache.set(song.id, lines)
    return lines
  }

  destroy(): void {
    this.controller?.abort()
    this.cache.clear()
  }
}
