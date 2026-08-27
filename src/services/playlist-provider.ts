import type { LyricLine, Song } from '../domain/types'

export interface PlaylistLoadOptions {
  signal?: AbortSignal
}

export interface PlaylistProvider {
  load(options?: PlaylistLoadOptions): Promise<Song[]>
}

type Fetcher = typeof fetch

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveResource(value: string, baseUrl?: string): string {
  if (!baseUrl) return value
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}

function parseLyrics(value: unknown): string | LyricLine[] | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  const lines = value.flatMap((line) => {
    if (!line || typeof line !== 'object') return []
    const item = line as Record<string, unknown>
    if (typeof item.timeMs !== 'number' || typeof item.text !== 'string') return []
    const words = Array.isArray(item.words)
      ? item.words.flatMap((word) => {
          if (!word || typeof word !== 'object') return []
          const data = word as Record<string, unknown>
          if (typeof data.startMs !== 'number' || typeof data.text !== 'string') return []
          return [{
            startMs: data.startMs,
            endMs: typeof data.endMs === 'number' ? data.endMs : undefined,
            text: data.text,
          }]
        })
      : undefined
    return [{
      timeMs: item.timeMs,
      text: item.text,
      kind: item.kind === 'credit' ? 'credit' as const : 'lyric' as const,
      words,
    }]
  })
  return lines.length ? lines : undefined
}

export function parsePlaylist(payload: unknown, baseUrl?: string): Song[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).playlist ?? (payload as Record<string, unknown>).songs)
      : undefined
  if (!Array.isArray(source)) throw new Error('歌单 JSON 必须是数组，或包含 playlist/songs 数组')

  return source.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`第 ${index + 1} 首歌曲格式无效`)
    const item = value as Record<string, unknown>
    const title = optionalString(item.title)
    const src = optionalString(item.src)
    if (!title || !src) throw new Error(`第 ${index + 1} 首歌曲缺少 title 或 src`)

    const id = typeof item.id === 'string' || typeof item.id === 'number'
      ? item.id
      : `${src}#${index}`
    const duration = typeof item.duration === 'number' && Number.isFinite(item.duration)
      ? Math.max(item.duration, 0)
      : undefined
    const artwork = Array.isArray(item.artwork)
      ? item.artwork.flatMap((image) => {
          if (!image || typeof image !== 'object') return []
          const data = image as Record<string, unknown>
          const imageSrc = optionalString(data.src)
          if (!imageSrc) return []
          return [{
            src: resolveResource(imageSrc, baseUrl),
            sizes: optionalString(data.sizes),
            type: optionalString(data.type),
          }]
        })
      : undefined

    return {
      id,
      title,
      artist: optionalString(item.artist),
      album: optionalString(item.album),
      src: resolveResource(src, baseUrl),
      duration,
      artwork,
      crossOrigin: item.crossOrigin === '' || item.crossOrigin === 'anonymous' || item.crossOrigin === 'use-credentials'
        ? item.crossOrigin
        : undefined,
      lyrics: parseLyrics(item.lyrics),
      lyricsUrl: optionalString(item.lyricsUrl)
        ? resolveResource(optionalString(item.lyricsUrl)!, baseUrl)
        : undefined,
    }
  })
}

export class ArrayPlaylistProvider implements PlaylistProvider {
  constructor(private readonly songs: readonly Song[]) {}

  async load(): Promise<Song[]> {
    return this.songs.map((song) => ({ ...song }))
  }
}

export class JsonPlaylistProvider implements PlaylistProvider {
  constructor(
    private readonly url: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async load(options: PlaylistLoadOptions = {}): Promise<Song[]> {
    const response = await this.fetcher(this.url, { signal: options.signal })
    if (!response.ok) throw new Error(`歌单请求失败（HTTP ${response.status}）`)
    return parsePlaylist(await response.json(), response.url || this.url)
  }
}

export class FilePlaylistProvider implements PlaylistProvider {
  constructor(private readonly file: Blob) {}

  async load(): Promise<Song[]> {
    let payload: unknown
    try {
      payload = JSON.parse(await this.file.text())
    } catch {
      throw new Error('所选文件不是有效的 JSON 歌单')
    }
    return parsePlaylist(payload)
  }
}
