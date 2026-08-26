import { ArcueidMusicPlayer } from './player-element'

if (!customElements.get('arcueid-music-player')) {
  customElements.define('arcueid-music-player', ArcueidMusicPlayer)
}

export { ArcueidMusicPlayer }
export {
  ArrayPlaylistProvider,
  FilePlaylistProvider,
  JsonPlaylistProvider,
  parsePlaylist,
} from './services/playlist-provider'
export type { PlaylistLoadOptions, PlaylistProvider } from './services/playlist-provider'
export type { LyricLine, PlayMode, PlayerState, Song } from './domain/types'
