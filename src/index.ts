import { ArcueidMusicPlayer } from './player-element'

if (!customElements.get('arcueid-music-player')) {
  customElements.define('arcueid-music-player', ArcueidMusicPlayer)
}

export { ArcueidMusicPlayer }
export type { LyricLine, PlayMode, PlayerState, Song } from './domain/types'
