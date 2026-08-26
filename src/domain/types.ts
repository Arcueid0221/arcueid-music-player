export type PlayMode = 'order' | 'single' | 'random'

export type PlayerPanel = 'lyrics' | 'queue' | null

export interface LyricLine {
  timeMs: number
  text: string
  kind?: 'credit' | 'lyric'
}

export interface Song {
  id: string | number
  title: string
  artist?: string
  album?: string
  src: string
  duration?: number
  artwork?: MediaImage[]
  lyrics?: string | LyricLine[]
  lyricsUrl?: string
}

export interface PlayerState {
  playlist: Song[]
  currentIndex: number
  currentTime: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  isPlaying: boolean
  isLoading: boolean
  isPlaylistLoading: boolean
  error?: string
  playlistMessage?: string
  playMode: PlayMode
  panel: PlayerPanel
  lyrics: LyricLine[]
  activeLyricIndex: number
}

export interface AudioSnapshot {
  currentTime: number
  duration: number
  buffered: number
  isPlaying: boolean
  isLoading: boolean
  error?: string
}
