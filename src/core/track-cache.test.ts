import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../domain/types'
import type { DecodedTrack } from './buffer-playback'
import { DESKTOP_MAX_CACHED_BYTES, IOS_MAX_CACHED_BYTES, TrackCache } from './track-cache'

const song = (src: string): Song => ({ id: src, title: src, artist: 'a', src, crossOrigin: 'anonymous' })
const decoded: DecodedTrack = { duration: 1, sampleRate: 4, numberOfChannels: 1, getChannelData: () => new Float32Array(4) }

function fakeDeps() {
  return {
    fetch: vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return new Response(new Uint8Array(16))
    }),
    decode: vi.fn(async () => decoded),
  }
}

describe('TrackCache', () => {
  it('downloads with CORS and keeps the decoded track for that source', async () => {
    const deps = fakeDeps()
    const cache = new TrackCache(deps)
    const cached = await cache.prefetch(song('https://cdn.test/a.mp3'))

    expect(deps.fetch).toHaveBeenCalledWith('https://cdn.test/a.mp3', expect.objectContaining({ mode: 'cors', credentials: 'same-origin' }))
    expect(cached?.track).toBe(decoded)
    expect(cache.matches('https://cdn.test/a.mp3')).toBe(cached)
    expect(cache.matches('https://cdn.test/b.mp3')).toBeUndefined()
  })

  it('reuses a finished download for the same track', async () => {
    const deps = fakeDeps()
    const cache = new TrackCache(deps)
    await cache.prefetch(song('a.mp3'))
    await cache.prefetch(song('a.mp3'))
    expect(deps.fetch).toHaveBeenCalledTimes(1)
  })

  it('aborts an unfinished download and drops the previous track on track change', async () => {
    let release!: () => void
    const deps = fakeDeps()
    const fetchTrack = deps.fetch.getMockImplementation()!
    deps.fetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      await new Promise<void>((resolve) => { release = resolve })
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return new Response(new Uint8Array(4))
    })
    const cache = new TrackCache(deps)
    const first = cache.prefetch(song('a.mp3'))
    cache.retain('b.mp3')
    release()
    expect(await first).toBeUndefined()
    expect(cache.ready).toBeUndefined()

    deps.fetch.mockImplementation(fetchTrack)
    await cache.prefetch(song('b.mp3'))
    expect(cache.ready?.src).toBe('b.mp3')
    cache.retain('c.mp3')
    expect(cache.ready).toBeUndefined()
  })

  it('applies the size limit it was given, so iOS streams files desktop Safari would decode', async () => {
    const size = 20 * 1024 * 1024
    const sized = () => {
      const deps = fakeDeps()
      deps.fetch.mockResolvedValue(new Response(null, { headers: { 'content-length': String(size) } }))
      return deps
    }
    expect(await new TrackCache(sized(), IOS_MAX_CACHED_BYTES).prefetch(song('a.mp3'))).toBeDefined()
    expect(await new TrackCache(sized(), 16 * 1024 * 1024).prefetch(song('a.mp3'))).toBeUndefined()
    expect(await new TrackCache(sized()).prefetch(song('a.mp3'))).toBeDefined()
  })

  it('leaves playback streamed when the download is unusable', async () => {
    const tooLarge = fakeDeps()
    tooLarge.fetch.mockResolvedValue(new Response(null, { headers: { 'content-length': String(DESKTOP_MAX_CACHED_BYTES + 1) } }))
    expect(await new TrackCache(tooLarge).prefetch(song('a.mp3'))).toBeUndefined()
    expect(tooLarge.decode).not.toHaveBeenCalled()

    const failing = fakeDeps()
    failing.decode.mockRejectedValue(new Error('bad data'))
    const cache = new TrackCache(failing)
    expect(await cache.prefetch(song('a.mp3'))).toBeUndefined()
    expect(cache.ready).toBeUndefined()
  })
})
