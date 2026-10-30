import type { Song } from '../domain/types'
import type { DecodedTrack } from './buffer-playback'

/**
 * Decoded PCM is roughly 15–20× the size of a 320 kbps MP3 (about 230 MB for
 * a ten-minute stereo track). iOS keeps tabs on a tight memory budget, so it
 * streams longer files; desktop Safari can afford anything a playlist holds.
 */
export const IOS_MAX_CACHED_BYTES = 24 * 1024 * 1024
export const DESKTOP_MAX_CACHED_BYTES = 64 * 1024 * 1024

export interface TrackCacheDeps {
  fetch(url: string, init: RequestInit): Promise<Response>
  decode(data: ArrayBuffer): Promise<DecodedTrack>
}

export interface CachedTrack {
  src: string
  track: DecodedTrack
}

function credentialsFor(crossOrigin: Song['crossOrigin']): RequestCredentials {
  return crossOrigin === 'use-credentials' ? 'include' : 'same-origin'
}

/**
 * Downloads and decodes the active track once so WebKit can play it from
 * memory. Only the most recent track is kept; failures leave playback
 * streamed through the media element.
 */
export class TrackCache {
  private cached?: CachedTrack
  private pending?: { src: string; controller: AbortController }

  constructor(
    private readonly deps: TrackCacheDeps,
    private readonly maxBytes = DESKTOP_MAX_CACHED_BYTES,
  ) {}

  get ready(): CachedTrack | undefined {
    return this.cached
  }

  matches(src: string): CachedTrack | undefined {
    return this.cached?.src === src ? this.cached : undefined
  }

  /** Keeps only `src`; anything else is aborted or released. */
  retain(src: string): void {
    if (this.pending && this.pending.src !== src) {
      this.pending.controller.abort()
      this.pending = undefined
    }
    if (this.cached && this.cached.src !== src) this.cached = undefined
  }

  async prefetch(song: Song): Promise<CachedTrack | undefined> {
    this.retain(song.src)
    if (this.cached || this.pending) return this.cached
    const controller = new AbortController()
    this.pending = { src: song.src, controller }
    try {
      const response = await this.deps.fetch(song.src, {
        mode: 'cors',
        credentials: credentialsFor(song.crossOrigin),
        signal: controller.signal,
      })
      if (!response.ok) return undefined
      if (Number(response.headers.get('content-length')) > this.maxBytes) {
        controller.abort()
        return undefined
      }
      const data = await response.arrayBuffer()
      if (controller.signal.aborted || data.byteLength > this.maxBytes) return undefined
      const track = await this.deps.decode(data)
      if (controller.signal.aborted) return undefined
      this.cached = { src: song.src, track }
      return this.cached
    } catch {
      return undefined
    } finally {
      if (this.pending?.controller === controller) this.pending = undefined
    }
  }

  destroy(): void {
    this.pending?.controller.abort()
    this.pending = undefined
    this.cached = undefined
  }
}
