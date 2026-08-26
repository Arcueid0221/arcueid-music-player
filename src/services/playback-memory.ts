import type { PlayMode } from '../domain/types'

interface PlaybackMemoryValue {
  songId: string | number
  currentTime: number
  volume: number
  muted: boolean
  playMode: PlayMode
}

export class PlaybackMemory {
  constructor(
    private readonly enabled: boolean,
    private readonly key = 'arcueid-music-player:playback',
  ) {}

  read(): PlaybackMemoryValue | null {
    if (!this.enabled) return null
    try {
      const value = JSON.parse(localStorage.getItem(this.key) ?? '') as PlaybackMemoryValue
      if (value && ['order', 'single', 'random'].includes(value.playMode)) return value
    } catch {
      // A malformed or unavailable storage entry should never block playback.
    }
    return null
  }

  write(value: PlaybackMemoryValue): void {
    if (!this.enabled) return
    try {
      localStorage.setItem(this.key, JSON.stringify(value))
    } catch {
      // Storage can be disabled by the browser; playback remains fully usable.
    }
  }
}
