import { describe, expect, it, vi } from 'vitest'
import type { PlayerState } from '../domain/types'
import { MediaSessionService } from './media-session'

function createState(update: Partial<PlayerState> = {}): PlayerState {
  return {
    playlist: [{ id: 'song', title: 'Song', artist: 'Artist', album: 'Album', src: '/song.mp3' }],
    currentIndex: 0,
    currentTime: 25,
    duration: 100,
    buffered: 70,
    volume: 0.8,
    muted: false,
    isPlaying: true,
    isLoading: false,
    isPlaylistLoading: false,
    canRetry: false,
    canSkip: false,
    playMode: 'order',
    panel: null,
    lyrics: [],
    activeLyricIndex: -1,
    lyricOffsetMs: 0,
    ...update,
  }
}

describe('MediaSessionService', () => {
  it('publishes track metadata, playback state and position', () => {
    const position = vi.fn()
    const session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
      setPositionState: position,
    }
    const createMetadata = vi.fn((init: MediaMetadataInit) => init as unknown as MediaMetadata)
    const service = new MediaSessionService(session as unknown as MediaSession, createMetadata)

    service.update(createState())

    expect(createMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'Song', artist: 'Artist' }))
    expect(session.playbackState).toBe('playing')
    expect(position).toHaveBeenCalledWith({ duration: 100, playbackRate: 1, position: 25 })
  })

  it('maps system media actions to controller operations', () => {
    const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
    const session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => handlers.set(action, handler),
      setPositionState: vi.fn(),
    }
    const controls = {
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      seekBy: vi.fn(),
    }
    const service = new MediaSessionService(session as unknown as MediaSession)
    const disconnect = service.connect(controls)

    handlers.get('play')?.({ action: 'play' })
    handlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 15 })
    handlers.get('seekto')?.({ action: 'seekto', seekTime: 42 })

    expect(controls.play).toHaveBeenCalledOnce()
    expect(controls.seekBy).toHaveBeenCalledWith(15)
    expect(controls.seek).toHaveBeenCalledWith(42)

    disconnect()
    expect(handlers.get('play')).toBeNull()
  })
})
