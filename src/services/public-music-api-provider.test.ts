import { describe, expect, it, vi } from 'vitest'
import { PlaylistCatalogUnavailableError } from './playlist-catalog-provider'
import {
  parsePublicPlaylist,
  parsePublicResolvedPlaylist,
  parsePublicPlaylistSummaries,
  PublicMusicApiProvider,
} from './public-music-api-provider'

describe('PublicMusicApiProvider', () => {
  it('parses public playlist summaries and resolves covers', () => {
    expect(parsePublicPlaylistSummaries({ data: [
      { id: 'public', name: 'Public', cover: './cover.jpg', isPublic: true },
      { name: 'Missing id' },
    ] }, 'https://blog.example/api/music/playlists')).toEqual([
      expect.objectContaining({
        id: 'public',
        cover: 'https://blog.example/api/music/cover.jpg',
      }),
    ])
  })

  it('maps the public backend contract to player songs', () => {
    expect(parsePublicPlaylist({ data: {
      id: 'default',
      tracks: [{
        id: 'track-1',
        title: 'Public track',
        artist: 'Artist',
        audioUrl: './audio/song.mp3',
        lyricUrl: './lyrics/song.lrc',
        cover: './covers/song.jpg',
        crossOrigin: 'anonymous',
      }],
    } }, 'https://blog.example/api/music/playlists/default')).toEqual([
      expect.objectContaining({
        id: 'track-1',
        src: 'https://blog.example/api/music/playlists/audio/song.mp3',
        lyricsUrl: 'https://blog.example/api/music/playlists/lyrics/song.lrc',
        artwork: [{ src: 'https://blog.example/api/music/playlists/covers/song.jpg' }],
        crossOrigin: 'anonymous',
      }),
    ])
  })

  it('normalizes a public playlist into the shared runtime model', () => {
    expect(parsePublicResolvedPlaylist({ data: {
      id: 'default',
      name: 'Default',
      cover: './cover.jpg',
      tracks: [{ id: 'song', title: 'Song', audioUrl: './song.mp3' }],
    } }, 'https://blog.example/api/music/playlists/default', 'fallback')).toEqual(expect.objectContaining({
      id: 'default',
      name: 'Default',
      cover: 'https://blog.example/api/music/playlists/cover.jpg',
      trackCount: 1,
      songs: [expect.objectContaining({ id: 'song' })],
    }))
  })

  it('loads a configured playlist directly', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { id: 'featured', tracks: [{ id: 1, title: 'Featured', audioUrl: '/music/featured.mp3' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = new PublicMusicApiProvider('https://blog.example/api/music', {
      playlistId: 'featured',
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 1, title: 'Featured', src: 'https://blog.example/music/featured.mp3' }),
    ])
    expect(fetcher).toHaveBeenCalledWith(
      'https://blog.example/api/music/playlists/featured',
      { signal: undefined },
    )
  })

  it('discovers the default public playlist before loading details', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/playlists')) return new Response(JSON.stringify({ data: [
        { id: 'private', name: 'Private', isPublic: false },
        { id: 'default', name: 'Default', isPublic: true, isDefault: true },
      ] }), { status: 200 })
      return new Response(JSON.stringify({ data: {
        id: 'default',
        tracks: [{ order: 1, track: { id: 'song', title: 'Song', audioUrl: '/song.mp3' } }],
      } }), { status: 200 })
    })
    const provider = new PublicMusicApiProvider('https://blog.example/api/music/', { fetcher: fetcher as typeof fetch })

    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 'song', src: 'https://blog.example/song.mp3' }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('exposes only public playlists for catalog browsing', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: 'private', name: 'Private', isPublic: false },
      { id: 'public', name: 'Public', isPublic: true },
    ] }), { status: 200 }))
    const provider = new PublicMusicApiProvider('https://blog.example/api/music', {
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.listPlaylists()).resolves.toEqual([
      expect.objectContaining({ id: 'public' }),
    ])
  })

  it('keeps loading a legacy single-playlist response from the list endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: {
      id: 'legacy',
      tracks: [{ id: 'song', title: 'Legacy song', audioUrl: '/legacy.mp3' }],
    } }), { status: 200 }))
    const provider = new PublicMusicApiProvider('https://blog.example/api/music', {
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 'song', src: 'https://blog.example/legacy.mp3' }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports a typed catalog error for the legacy single-playlist list response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: {
      id: 'legacy',
      tracks: [{ id: 'song', title: 'Legacy song', audioUrl: '/legacy.mp3' }],
    } }), { status: 200 }))
    const provider = new PublicMusicApiProvider('https://blog.example/api/music', {
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.listPlaylists()).rejects.toBeInstanceOf(PlaylistCatalogUnavailableError)
  })
})
