import type { PlaylistSummary, ResolvedPlaylist } from '../domain/playlist-catalog'
import type { Song } from '../domain/types'
import type { PlaylistCatalogProvider } from './playlist-catalog-provider'
import { parsePlaylist, type PlaylistLoadOptions } from './playlist-provider'

type Fetcher = typeof fetch

export interface ConfigPlaylistProviderOptions {
  playlistId?: string | number
  fetcher?: Fetcher
}

export interface ParsedPlaylistCatalog {
  defaultPlaylistId: string | number
  playlists: ResolvedPlaylist[]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseId(value: unknown, label: string): string | number {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`${label} 必须是非空字符串或有限数字`)
}

function resolveResource(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}

function cloneSong(song: Song): Song {
  return {
    ...song,
    artwork: song.artwork?.map((image) => ({ ...image })),
    lyrics: Array.isArray(song.lyrics)
      ? song.lyrics.map((line) => ({
          ...line,
          words: line.words?.map((word) => ({ ...word })),
        }))
      : song.lyrics,
  }
}

function clonePlaylist(playlist: ResolvedPlaylist): ResolvedPlaylist {
  return { ...playlist, songs: playlist.songs.map(cloneSong) }
}

export function parsePlaylistConfig(payload: unknown, baseUrl: string): ParsedPlaylistCatalog {
  const root = asRecord(payload)
  if (!root || !Array.isArray(root.playlists)) {
    throw new Error('多歌单配置必须包含 playlists 数组')
  }
  if (!root.playlists.length) throw new Error('多歌单配置至少需要一个歌单')

  const ids = new Set<string>()
  const declaredDefaults: Array<string | number> = []
  const playlists = root.playlists.map((value, index): ResolvedPlaylist => {
    const item = asRecord(value)
    if (!item) throw new Error(`第 ${index + 1} 个歌单格式无效`)
    const id = parseId(item.id, `第 ${index + 1} 个歌单的 id`)
    const key = String(id)
    if (ids.has(key)) throw new Error(`歌单 id 重复：${key}`)
    ids.add(key)

    const name = optionalString(item.name)
    if (!name) throw new Error(`第 ${index + 1} 个歌单缺少 name`)
    if (!Array.isArray(item.songs)) throw new Error(`歌单 ${name} 缺少 songs 数组`)
    if (item.isDefault === true) declaredDefaults.push(id)

    const songs = parsePlaylist({ songs: item.songs }, baseUrl)
    const cover = optionalString(item.cover)
    return {
      id,
      name,
      description: optionalString(item.description),
      cover: cover ? resolveResource(cover, baseUrl) : undefined,
      trackCount: songs.length,
      isDefault: item.isDefault === true,
      songs,
    }
  })

  const configuredDefault = root.defaultPlaylistId === undefined
    ? undefined
    : parseId(root.defaultPlaylistId, 'defaultPlaylistId')
  if (configuredDefault !== undefined && !ids.has(String(configuredDefault))) {
    throw new Error(`默认歌单不存在：${String(configuredDefault)}`)
  }
  if (configuredDefault === undefined && declaredDefaults.length > 1) {
    throw new Error('只能有一个歌单标记为 isDefault')
  }

  const defaultPlaylistId = configuredDefault ?? declaredDefaults[0] ?? playlists[0].id
  playlists.forEach((playlist) => {
    playlist.isDefault = String(playlist.id) === String(defaultPlaylistId)
  })
  return { defaultPlaylistId, playlists }
}

export class ConfigPlaylistProvider implements PlaylistCatalogProvider {
  private readonly fetcher: Fetcher
  private catalog?: ParsedPlaylistCatalog
  private catalogRequest?: Promise<ParsedPlaylistCatalog>

  constructor(
    private readonly url: string,
    private readonly options: ConfigPlaylistProviderOptions = {},
  ) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  }

  async load(options: PlaylistLoadOptions = {}): Promise<Song[]> {
    const catalog = await this.loadCatalog(options)
    const requestedId = this.options.playlistId ?? catalog.defaultPlaylistId
    return (await this.getPlaylist(requestedId, options)).songs
  }

  async listPlaylists(options: PlaylistLoadOptions = {}): Promise<PlaylistSummary[]> {
    const catalog = await this.loadCatalog(options)
    return catalog.playlists.map(({ songs: _songs, ...playlist }) => ({ ...playlist }))
  }

  async getPlaylist(
    playlistId: string | number,
    options: PlaylistLoadOptions = {},
  ): Promise<ResolvedPlaylist> {
    const catalog = await this.loadCatalog(options)
    const playlist = catalog.playlists.find((item) => String(item.id) === String(playlistId))
    if (!playlist) throw new Error(`找不到歌单：${String(playlistId)}`)
    return clonePlaylist(playlist)
  }

  private async loadCatalog(options: PlaylistLoadOptions): Promise<ParsedPlaylistCatalog> {
    if (this.catalog) return this.catalog
    if (!this.url.trim()) throw new Error('多歌单配置地址不能为空')
    if (!this.catalogRequest) {
      this.catalogRequest = this.fetcher(this.url, { signal: options.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`多歌单配置请求失败（HTTP ${response.status}）`)
          return parsePlaylistConfig(await response.json(), response.url || this.url)
        })
    }
    try {
      this.catalog = await this.catalogRequest
      return this.catalog
    } finally {
      this.catalogRequest = undefined
    }
  }
}
