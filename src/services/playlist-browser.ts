import type { PlaylistSummary } from '../domain/music-api'
import type { Song } from '../domain/types'
import { PublicMusicApiProvider } from './public-music-api-provider'

export type PlaylistBrowserView = 'playlists' | 'tracks'

export interface PlaylistBrowserState {
  view: PlaylistBrowserView
  playlists: PlaylistSummary[]
  selectedPlaylist?: PlaylistSummary
  songs: Song[]
  playbackPlaylistId?: string | number
  isLoading: boolean
  error?: string
}

export interface PlaylistBrowserSelection {
  playlist: PlaylistSummary
  songs: Song[]
}

type PlaylistBrowserListener = (state: PlaylistBrowserState) => void

export class PlaylistBrowser {
  private state: PlaylistBrowserState = {
    view: 'tracks',
    playlists: [],
    songs: [],
    isLoading: false,
  }
  private readonly listeners = new Set<PlaylistBrowserListener>()
  private readonly songCache = new Map<string, Song[]>()
  private request?: AbortController

  constructor(private readonly provider: PublicMusicApiProvider) {}

  getState(): PlaylistBrowserState {
    return {
      ...this.state,
      playlists: [...this.state.playlists],
      songs: [...this.state.songs],
    }
  }

  subscribe(listener: PlaylistBrowserListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(preferredId?: string | number, signal?: AbortSignal): Promise<PlaylistBrowserSelection> {
    const request = this.beginRequest(signal)
    this.setState({ view: 'tracks', isLoading: true, error: undefined })
    try {
      const playlists = await this.provider.listPlaylists({ signal: request.signal })
      const selected = preferredId !== undefined
        ? playlists.find((playlist) => String(playlist.id) === String(preferredId))
        : undefined
      const playlist = selected ?? playlists.find((item) => item.isDefault) ?? playlists[0]
      if (!playlist) throw new Error('公开音乐 API 没有可浏览歌单')
      const songs = await this.loadSongs(playlist.id, request.signal)
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this.setState({
        playlists,
        selectedPlaylist: playlist,
        songs,
        playbackPlaylistId: playlist.id,
        view: 'tracks',
        isLoading: false,
      })
      return { playlist, songs: [...songs] }
    } catch (error) {
      if (!request.signal.aborted) {
        this.setState({ isLoading: false, error: error instanceof Error ? error.message : '歌单加载失败' })
      }
      throw error
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  showPlaylists(): void {
    this.request?.abort()
    this.setState({ view: 'playlists', isLoading: false, error: undefined })
  }

  async browse(playlistId: string | number): Promise<PlaylistBrowserSelection> {
    const playlist = this.state.playlists.find((item) => String(item.id) === String(playlistId))
    if (!playlist) throw new Error('找不到所选歌单')
    const request = this.beginRequest()
    this.setState({ selectedPlaylist: playlist, songs: [], view: 'tracks', isLoading: true, error: undefined })
    try {
      const songs = await this.loadSongs(playlist.id, request.signal)
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this.setState({ songs, isLoading: false })
      return { playlist, songs: [...songs] }
    } catch (error) {
      if (!request.signal.aborted) {
        this.setState({ isLoading: false, error: error instanceof Error ? error.message : '歌单加载失败' })
      }
      throw error
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  markPlaybackPlaylist(playlistId: string | number): void {
    this.setState({ playbackPlaylistId: playlistId })
  }

  destroy(): void {
    this.request?.abort()
    this.listeners.clear()
    this.songCache.clear()
  }

  private async loadSongs(playlistId: string | number, signal: AbortSignal): Promise<Song[]> {
    const key = String(playlistId)
    const cached = this.songCache.get(key)
    if (cached) return [...cached]
    const songs = await this.provider.loadPlaylist(playlistId, signal)
    this.songCache.set(key, [...songs])
    return songs
  }

  private beginRequest(externalSignal?: AbortSignal): AbortController {
    this.request?.abort()
    const request = new AbortController()
    if (externalSignal?.aborted) request.abort()
    else externalSignal?.addEventListener('abort', () => request.abort(), { once: true })
    this.request = request
    return request
  }

  private setState(patch: Partial<PlaylistBrowserState>): void {
    this.state = { ...this.state, ...patch }
    const snapshot = this.getState()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
