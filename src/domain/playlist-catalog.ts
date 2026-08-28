import type { Song } from './types'

export interface PlaylistSummary {
  id: string | number
  name: string
  description?: string
  cover?: string
  trackCount?: number
  isPublic?: boolean
  isDefault?: boolean
}

export interface ResolvedPlaylist extends PlaylistSummary {
  songs: Song[]
}
