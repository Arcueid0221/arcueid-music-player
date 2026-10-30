/** The parts of AudioContext that buffer playback needs, so tests can fake them. */
export interface BufferPlaybackContext {
  readonly currentTime: number
  createBufferSource(): AudioBufferSourceNode
}

export type DecodedTrack = Pick<AudioBuffer, 'duration' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>

/** Returns analyser-style unsigned bytes for `size` frames starting at `time`. */
export function decodedWindow(track: DecodedTrack, time: number, size = 256): Uint8Array | null {
  const start = Math.floor(time * track.sampleRate)
  const length = track.getChannelData(0).length
  if (!Number.isFinite(start) || start < 0 || start >= length) return null
  const end = Math.min(start + size, length)
  const mixed = new Float32Array(end - start)
  for (let channel = 0; channel < track.numberOfChannels; channel += 1) {
    const data = track.getChannelData(channel)
    for (let index = start; index < end; index += 1) mixed[index - start] += data[index] / track.numberOfChannels
  }
  return Uint8Array.from(mixed, (value) => Math.min(Math.max(Math.round(128 + value * 127), 0), 255))
}

/**
 * Plays a decoded track through Web Audio. Seeking only restarts a source
 * node, so it is immediate and never overlaps the previous position.
 */
export class BufferPlayback {
  private node?: AudioBufferSourceNode
  private startedAt = 0
  private offset = 0
  private playing = false

  constructor(
    private readonly context: BufferPlaybackContext,
    private readonly output: AudioNode,
    readonly track: DecodedTrack,
    private readonly onEnded: () => void,
  ) {}

  get duration(): number {
    return this.track.duration
  }

  get currentTime(): number {
    if (!this.playing) return this.offset
    return Math.min(this.offset + this.context.currentTime - this.startedAt, this.duration)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  play(): void {
    if (this.playing) return
    if (this.offset >= this.duration) this.offset = 0
    this.start()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.currentTime
    this.release()
    this.playing = false
  }

  seek(seconds: number): void {
    this.offset = Math.min(Math.max(seconds, 0), this.duration)
    if (!this.playing) return
    this.release()
    this.start()
  }

  stop(): void {
    this.release()
    this.playing = false
    this.offset = 0
  }

  private start(): void {
    const node = this.context.createBufferSource()
    node.buffer = this.track as AudioBuffer
    node.connect(this.output)
    node.onended = () => {
      if (this.node !== node) return
      this.node = undefined
      this.playing = false
      this.offset = this.duration
      this.onEnded()
    }
    node.start(0, this.offset)
    this.node = node
    this.startedAt = this.context.currentTime
    this.playing = true
  }

  private release(): void {
    const node = this.node
    this.node = undefined
    if (!node) return
    node.onended = null
    node.stop()
    node.disconnect()
  }
}
