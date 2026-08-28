import type { PlaylistSummary, ResolvedPlaylist } from '../domain/playlist-catalog'
import type { PlaylistLoadOptions, PlaylistProvider } from './playlist-provider'

export interface PlaylistCatalogProvider extends PlaylistProvider {
  listPlaylists(options?: PlaylistLoadOptions): Promise<PlaylistSummary[]>
  getPlaylist(playlistId: string | number, options?: PlaylistLoadOptions): Promise<ResolvedPlaylist>
}

export class PlaylistCatalogUnavailableError extends Error {
  constructor(message = '数据源不提供可浏览的歌单目录') {
    super(message)
    this.name = 'PlaylistCatalogUnavailableError'
  }
}
