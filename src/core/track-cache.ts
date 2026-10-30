import type { Song } from '../domain/types'
import type { DecodedTrack } from './buffer-playback'

/**
 * Decoded PCM is roughly 20× the MP3 size (about 100 MB for a five-minute
 * stereo track), so longer files stay streamed to keep iOS within its limits.
 */
export const MAX_CACHED_BYTES = 12 * 1024 * 1024

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

  constructor(private readonly deps: TrackCacheDeps) {}

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
      if (Number(response.headers.get('content-length')) > MAX_CACHED_BYTES) {
        controller.abort()
        return undefined
      }
      const data = await response.arrayBuffer()
      if (controller.signal.aborted || data.byteLength > MAX_CACHED_BYTES) return undefined
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
