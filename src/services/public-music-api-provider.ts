import type { Playlist, PlaylistSummary, PlaylistTrack, Track } from '../domain/music-api'
import type { Song } from '../domain/types'
import type { PlaylistLoadOptions, PlaylistProvider } from './playlist-provider'

type Fetcher = typeof fetch

export interface PublicMusicApiProviderOptions {
  playlistId?: string | number
  fetcher?: Fetcher
}

function unwrapData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return 'data' in record ? record.data : value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveResource(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function parsePublicTrack(value: unknown, baseUrl: string, index = 0): Song {
  const track = asRecord(value)
  const title = optionalString(track?.title)
  const audioUrl = optionalString(track?.audioUrl) ?? optionalString(track?.src)
  if (!track || !title || !audioUrl) throw new Error(`第 ${index + 1} 首公开歌曲缺少 title 或 audioUrl`)

  const id = typeof track.id === 'string' || typeof track.id === 'number'
    ? track.id
    : `${audioUrl}#${index}`
  const cover = optionalString(track.cover)
  const lyricsUrl = optionalString(track.lyricUrl) ?? optionalString(track.lyricsUrl)
  const crossOrigin = track.crossOrigin === '' || track.crossOrigin === 'anonymous' || track.crossOrigin === 'use-credentials'
    ? track.crossOrigin
    : undefined
  const duration = typeof track.duration === 'number' && Number.isFinite(track.duration)
    ? Math.max(track.duration, 0)
    : undefined

  return {
    id,
    title,
    artist: optionalString(track.artist),
    album: optionalString(track.album),
    src: resolveResource(audioUrl, baseUrl),
    lyricsUrl: lyricsUrl ? resolveResource(lyricsUrl, baseUrl) : undefined,
    artwork: cover ? [{ src: resolveResource(cover, baseUrl) }] : undefined,
    crossOrigin,
    duration,
  }
}

function extractTrack(entry: unknown): unknown {
  const record = asRecord(entry)
  return record && 'track' in record ? record.track : entry
}

export function parsePublicPlaylist(value: unknown, baseUrl: string): Song[] {
  const payload = unwrapData(value)
  const record = asRecord(payload)
  const source = Array.isArray(payload)
    ? payload
    : record?.tracks ?? record?.playlistTracks ?? record?.songs
  if (!Array.isArray(source)) throw new Error('公开歌单响应缺少 tracks 数组')
  return source.map((entry, index) => parsePublicTrack(extractTrack(entry), baseUrl, index))
}

function extractPlaylistSummaries(value: unknown): PlaylistSummary[] {
  const payload = unwrapData(value)
  const source = Array.isArray(payload) ? payload : asRecord(payload)?.playlists
  if (!Array.isArray(source)) throw new Error('公开歌单列表响应缺少 playlists 数组')
  return source.flatMap((item) => {
    const record = asRecord(item)
    if (!record || (typeof record.id !== 'string' && typeof record.id !== 'number')) return []
    return [{
      id: record.id,
      name: optionalString(record.name) ?? String(record.id),
      description: optionalString(record.description),
      cover: optionalString(record.cover),
      isPublic: typeof record.isPublic === 'boolean' ? record.isPublic : undefined,
      isDefault: record.isDefault === true,
    }]
  })
}

function hasTracks(value: unknown): boolean {
  const payload = unwrapData(value)
  const record = asRecord(payload)
  return Array.isArray(record?.tracks) || Array.isArray(record?.playlistTracks) || Array.isArray(record?.songs)
}

export class PublicMusicApiProvider implements PlaylistProvider {
  private readonly baseUrl: string
  private readonly fetcher: Fetcher

  constructor(baseUrl: string, private readonly options: PublicMusicApiProviderOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.fetcher = options.fetcher ?? fetch
  }

  async load(options: PlaylistLoadOptions = {}): Promise<Song[]> {
    if (!this.baseUrl) throw new Error('Public Music API 地址不能为空')
    if (this.options.playlistId !== undefined && String(this.options.playlistId).trim()) {
      return this.loadPlaylist(this.options.playlistId, options.signal)
    }

    const listUrl = `${this.baseUrl}/playlists`
    const response = await this.fetcher(listUrl, { signal: options.signal })
    if (!response.ok) throw new Error(`公开歌单列表请求失败（HTTP ${response.status}）`)
    const payload = await response.json()

    if (hasTracks(payload)) return parsePublicPlaylist(payload, response.url || listUrl)
    const playlists = extractPlaylistSummaries(payload).filter((playlist) => playlist.isPublic !== false)
    const selected = playlists.find((playlist) => playlist.isDefault) ?? playlists[0]
    if (!selected) throw new Error('公开音乐 API 没有可播放歌单')
    return this.loadPlaylist(selected.id, options.signal)
  }

  private async loadPlaylist(playlistId: string | number, signal?: AbortSignal): Promise<Song[]> {
    const url = `${this.baseUrl}/playlists/${encodeURIComponent(String(playlistId))}`
    const response = await this.fetcher(url, { signal })
    if (!response.ok) throw new Error(`公开歌单请求失败（HTTP ${response.status}）`)
    return parsePublicPlaylist(await response.json(), response.url || url)
  }
}

export type { Playlist, PlaylistTrack, Track }
