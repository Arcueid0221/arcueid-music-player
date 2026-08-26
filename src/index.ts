import { ArcueidMusicPlayer } from './player-element'

if (typeof customElements !== 'undefined' && !customElements.get('arcueid-music-player')) {
  customElements.define('arcueid-music-player', ArcueidMusicPlayer)
}

export { ArcueidMusicPlayer }
export { createMusicPlayer } from './create-player'
export type { CreateMusicPlayerOptions, MusicPlayerInstance } from './create-player'
export {
  ArrayPlaylistProvider,
  FilePlaylistProvider,
  JsonPlaylistProvider,
  parsePlaylist,
} from './services/playlist-provider'
export type { PlaylistLoadOptions, PlaylistProvider } from './services/playlist-provider'
export type {
  LyricLine,
  LyricWord,
  PlaybackChangeDetail,
  PlayMode,
  PlayerErrorDetail,
  PlayerState,
  PlayerTheme,
  Song,
  TrackChangeDetail,
} from './domain/types'
