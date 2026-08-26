import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../domain/types'
import { getNowPlayingText } from './now-playing-rail'

const state: PlayerState = {
  playlist: [{ id: '1', title: 'Song', artist: 'Artist', src: '/song.mp3' }],
  currentIndex: 0,
  currentTime: 0,
  duration: 100,
  volume: 0.8,
  muted: false,
  isPlaying: false,
  isLoading: false,
  playMode: 'order',
  panel: null,
  lyrics: [{ timeMs: 1_000, text: 'Current line' }],
  activeLyricIndex: -1,
}

describe('getNowPlayingText', () => {
  it('falls back to track metadata before the first lyric', () => {
    expect(getNowPlayingText(state)).toBe('Song · Artist')
  })

  it('shows the active lyric when available', () => {
    expect(getNowPlayingText({ ...state, activeLyricIndex: 0 })).toBe('Current line')
  })
})
