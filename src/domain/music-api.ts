export interface Track {
  id: string | number
  title: string
  artist?: string
  album?: string
  cover?: string
  audioUrl: string
  lyricUrl?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  duration?: number
}

export interface PlaylistSummary {
  id: string | number
  name: string
  description?: string
  cover?: string
  trackCount?: number
  isPublic?: boolean
  isDefault?: boolean
}

export interface PlaylistTrack {
  playlistId?: string | number
  trackId: string | number
  order: number
  track?: Track
}

export interface Playlist extends PlaylistSummary {
  tracks: Array<Track | PlaylistTrack>
}

export interface PublicMusicApiEnvelope<T> {
  data: T
  code?: string | number
  message?: string
}
