import { ArcueidMusicPlayer } from './player-element'

if (typeof customElements !== 'undefined' && !customElements.get('arcueid-music-player')) {
  customElements.define('arcueid-music-player', ArcueidMusicPlayer)
}

export { ArcueidMusicPlayer }
export { createMusicPlayer } from './create-player'
export type { CreateMusicPlayerOptions, MusicPlayerInstance } from './create-player'
export type {
  DockSide,
  DockSidePreference,
  FloatingInsets,
  FloatingPoint,
  FloatingSize,
} from './ui/floating-player'
export {
  ArrayPlaylistProvider,
  FilePlaylistProvider,
  JsonPlaylistProvider,
  parsePlaylist,
} from './services/playlist-provider'
export type { PlaylistLoadOptions, PlaylistProvider } from './services/playlist-provider'
export {
  parsePublicPlaylist,
  parsePublicPlaylistSummaries,
  parsePublicTrack,
  PublicMusicApiProvider,
} from './services/public-music-api-provider'
export type { PublicMusicApiProviderOptions } from './services/public-music-api-provider'
export { PlaylistBrowser } from './services/playlist-browser'
export type {
  PlaylistBrowserSelection,
  PlaylistBrowserState,
  PlaylistBrowserView,
} from './services/playlist-browser'
export type {
  Playlist,
  PlaylistSummary,
  PlaylistTrack,
  PublicMusicApiEnvelope,
  Track,
} from './domain/music-api'
export type {
  CollapseChangeDetail,
  LyricLine,
  LyricWord,
  PlaybackChangeDetail,
  PlaylistMode,
  PlayMode,
  PlayerErrorDetail,
  PlayerState,
  PlayerTheme,
  PositionChangeDetail,
  Song,
  TrackChangeDetail,
} from './domain/types'
