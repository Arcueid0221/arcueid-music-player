import type { PlaylistSummary, ResolvedPlaylist } from '../domain/playlist-catalog'
import type { Song } from '../domain/types'
import type { PlaylistCatalogProvider } from './playlist-catalog-provider'

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
  private readonly playlistCache = new Map<string, ResolvedPlaylist>()
  private request?: AbortController

  constructor(private readonly provider: PlaylistCatalogProvider) {}

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
      if (!playlist) throw new Error('数据源没有可浏览歌单')
      const resolved = await this.loadResolvedPlaylist(playlist.id, request.signal)
      const selectedPlaylist = { ...this.toSummary(resolved), ...playlist }
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this.setState({
        playlists,
        selectedPlaylist,
        songs: resolved.songs,
        playbackPlaylistId: selectedPlaylist.id,
        view: 'tracks',
        isLoading: false,
      })
      return { playlist: selectedPlaylist, songs: [...resolved.songs] }
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
      const resolved = await this.loadResolvedPlaylist(playlist.id, request.signal)
      const selectedPlaylist = { ...this.toSummary(resolved), ...playlist }
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this.setState({ selectedPlaylist, songs: resolved.songs, isLoading: false })
      return { playlist: selectedPlaylist, songs: [...resolved.songs] }
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
    this.playlistCache.clear()
  }

  private async loadResolvedPlaylist(
    playlistId: string | number,
    signal: AbortSignal,
  ): Promise<ResolvedPlaylist> {
    const key = String(playlistId)
    const cached = this.playlistCache.get(key)
    if (cached) return { ...cached, songs: [...cached.songs] }
    const playlist = await this.provider.getPlaylist(playlistId, { signal })
    this.playlistCache.set(key, { ...playlist, songs: [...playlist.songs] })
    return playlist
  }

  private toSummary({ songs: _songs, ...playlist }: ResolvedPlaylist): PlaylistSummary {
    return playlist
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
