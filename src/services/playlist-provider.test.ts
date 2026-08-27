import { describe, expect, it, vi } from 'vitest'
import {
  ArrayPlaylistProvider,
  FilePlaylistProvider,
  JsonPlaylistProvider,
  parsePlaylist,
} from './playlist-provider'

describe('playlist providers', () => {
  it('normalizes array and object JSON payloads', () => {
    expect(parsePlaylist([{ title: 'Song', src: './song.mp3' }], 'https://example.com/music/list.json')).toEqual([
      expect.objectContaining({ title: 'Song', src: 'https://example.com/music/song.mp3' }),
    ])
    expect(parsePlaylist({ songs: [{ id: 1, title: 'Other', src: '/other.mp3' }] })).toHaveLength(1)
  })

  it('rejects malformed songs with a useful position', () => {
    expect(() => parsePlaylist([{ title: 'Missing source' }])).toThrow('第 1 首歌曲缺少 title 或 src')
  })

  it('loads local arrays without exposing the original object', async () => {
    const song = { id: '1', title: 'Song', src: '/song.mp3' }
    const loaded = await new ArrayPlaylistProvider([song]).load()
    expect(loaded).toEqual([song])
    expect(loaded[0]).not.toBe(song)
  })

  it('loads and resolves a JSON API playlist', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ playlist: [{ title: 'Remote', src: './remote.mp3' }] }),
      { status: 200 },
    ))
    const provider = new JsonPlaylistProvider('https://example.com/api/playlist.json', fetcher as typeof fetch)
    const songs = await provider.load()
    expect(songs[0].src).toBe('https://example.com/api/remote.mp3')
  })

  it('keeps the browser fetch receiver intact when using the default fetcher', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(JSON.stringify({
        playlist: [{ title: 'Browser fetch', src: '/browser-fetch.mp3' }],
      }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetcher)

    try {
      await expect(new JsonPlaylistProvider('/music/playlist.json').load()).resolves.toEqual([
        expect.objectContaining({ title: 'Browser fetch', src: '/browser-fetch.mp3' }),
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('loads a user-selected JSON file', async () => {
    const provider = new FilePlaylistProvider(new Blob([
      JSON.stringify([{ id: 'file', title: 'File song', src: '/file.mp3' }]),
    ]))
    await expect(provider.load()).resolves.toEqual([
      expect.objectContaining({ id: 'file', title: 'File song' }),
    ])
  })
})
