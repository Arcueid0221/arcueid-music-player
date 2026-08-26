export type PlayMode = 'order' | 'single' | 'random'

export type PlayerPanel = 'lyrics' | 'queue' | null
export type PlayerTheme = 'light' | 'dark' | 'system'
export type PlaylistMode = 'readonly' | 'editable'

export interface LyricWord {
  startMs: number
  endMs?: number
  text: string
}

export interface LyricLine {
  timeMs: number
  text: string
  kind?: 'credit' | 'lyric'
  words?: LyricWord[]
}

export interface Song {
  id: string | number
  title: string
  artist?: string
  album?: string
  src: string
  duration?: number
  artwork?: MediaImage[]
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
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
  recoveryMessage?: string
  canRetry: boolean
  canSkip: boolean
  playMode: PlayMode
  panel: PlayerPanel
  lyrics: LyricLine[]
  activeLyricIndex: number
  lyricOffsetMs: number
}

export interface AudioSnapshot {
  currentTime: number
  duration: number
  buffered: number
  isPlaying: boolean
  isLoading: boolean
  error?: string
}

export interface TrackChangeDetail {
  song?: Song
  previousSong?: Song
  index: number
}

export interface PlaybackChangeDetail {
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
}

export interface PlayerErrorDetail {
  message: string
  song?: Song
  canRetry: boolean
  canSkip: boolean
}
