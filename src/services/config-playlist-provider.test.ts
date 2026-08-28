import { describe, expect, it, vi } from 'vitest'
import { ConfigPlaylistProvider, parsePlaylistConfig } from './config-playlist-provider'

const payload = {
  defaultPlaylistId: 'focus',
  playlists: [
    {
      id: 'focus',
      name: 'Focus',
      description: 'For deep work',
      cover: './covers/focus.jpg',
      songs: [{ id: 'one', title: 'One', src: './audio/one.mp3', lyricsUrl: './lyrics/one.lrc' }],
    },
    {
      id: 'rest',
      name: 'Rest',
      songs: [{ id: 'two', title: 'Two', src: '/audio/two.mp3' }],
    },
  ],
}

describe('ConfigPlaylistProvider', () => {
  it('normalizes playlists and resolves resources relative to the config URL', () => {
    const catalog = parsePlaylistConfig(payload, 'https://example.com/music/playlists.json')

    expect(catalog.defaultPlaylistId).toBe('focus')
    expect(catalog.playlists[0]).toEqual(expect.objectContaining({
      id: 'focus',
      cover: 'https://example.com/music/covers/focus.jpg',
      trackCount: 1,
      isDefault: true,
    }))
    expect(catalog.playlists[0].songs[0]).toEqual(expect.objectContaining({
      src: 'https://example.com/music/audio/one.mp3',
      lyricsUrl: 'https://example.com/music/lyrics/one.lrc',
    }))
  })

  it('loads the default playlist and reuses one config request for browsing', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    const provider = new ConfigPlaylistProvider('https://example.com/music/playlists.json', {
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.listPlaylists()).resolves.toEqual([
      expect.objectContaining({ id: 'focus', isDefault: true, trackCount: 1 }),
      expect.objectContaining({ id: 'rest', isDefault: false, trackCount: 1 }),
    ])
    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 'one' }),
    ])
    await expect(provider.getPlaylist('rest')).resolves.toEqual(expect.objectContaining({
      id: 'rest',
      songs: [expect.objectContaining({ id: 'two' })],
    }))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('lets playlistId override the configured default', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    const provider = new ConfigPlaylistProvider('https://example.com/music/playlists.json', {
      playlistId: 'rest',
      fetcher: fetcher as typeof fetch,
    })

    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 'two' }),
    ])
  })

  it('rejects duplicate ids and missing defaults', () => {
    expect(() => parsePlaylistConfig({
      playlists: [
        { id: 1, name: 'One', songs: [] },
        { id: '1', name: 'Duplicate', songs: [] },
      ],
    }, 'https://example.com/playlists.json')).toThrow('歌单 id 重复')

    expect(() => parsePlaylistConfig({
      defaultPlaylistId: 'missing',
      playlists: [{ id: 'one', name: 'One', songs: [] }],
    }, 'https://example.com/playlists.json')).toThrow('默认歌单不存在')
  })
})
