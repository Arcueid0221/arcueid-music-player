import { describe, expect, it } from 'vitest'
import {
  ArcueidMusicPlayer,
  resolveDockSidePreference,
  resolveInitialPlaylist,
  resolvePlaylistMode,
} from './player-element'

describe('resolvePlaylistMode', () => {
  it('defaults the visitor-facing player to readonly', () => {
    expect(resolvePlaylistMode(null)).toBe('readonly')
    expect(resolvePlaylistMode('unknown')).toBe('readonly')
  })

  it('keeps the legacy management UI available as an explicit opt-in', () => {
    expect(resolvePlaylistMode('editable')).toBe('editable')
  })
})

describe('resolveDockSidePreference', () => {
  it('accepts explicit sides and otherwise keeps automatic docking', () => {
    expect(resolveDockSidePreference('left')).toBe('left')
    expect(resolveDockSidePreference('right')).toBe('right')
    expect(resolveDockSidePreference('invalid')).toBe('auto')
  })
})

describe('playlist configuration attributes', () => {
  it('observes playlist-config for runtime source changes', () => {
    expect(ArcueidMusicPlayer.observedAttributes).toContain('playlist-config')
  })

  it.each([
    { playlistConfig: '/music/playlists.json', playlistSrc: null, musicApi: null },
    { playlistConfig: null, playlistSrc: '/music/playlist.json', musicApi: null },
    { playlistConfig: null, playlistSrc: null, musicApi: '/api/music' },
  ])('starts empty when an external playlist source is configured', (sources) => {
    const songs = [{ id: 'demo', title: 'Demo', src: '/demo.mp3' }]
    expect(resolveInitialPlaylist(songs, sources)).toEqual([])
  })

  it('keeps the supplied or demo playlist when no external source is configured', () => {
    const songs = [{ id: 'demo', title: 'Demo', src: '/demo.mp3' }]
    const initial = resolveInitialPlaylist(songs, {
      playlistConfig: null,
      playlistSrc: null,
      musicApi: null,
    })

    expect(initial).toEqual(songs)
    expect(initial).not.toBe(songs)
  })
})
