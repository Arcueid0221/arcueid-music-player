import { describe, expect, it, vi } from 'vitest'
import { BufferPlayback, decodedWindow, type DecodedTrack } from './buffer-playback'

function fakeTrack(duration = 10, sampleRate = 4): DecodedTrack {
  const left = Float32Array.from({ length: duration * sampleRate }, (_, index) => (index % 2 ? 1 : -1))
  const right = Float32Array.from({ length: duration * sampleRate }, () => 0)
  return { duration, sampleRate, numberOfChannels: 2, getChannelData: (channel: number) => (channel ? right : left) }
}

function fakeContext() {
  const nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = []
  const context = {
    currentTime: 0,
    createBufferSource: () => {
      const node = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      nodes.push(node)
      return node as unknown as AudioBufferSourceNode
    },
  }
  return { context, nodes }
}

describe('decodedWindow', () => {
  it('mixes channels into analyser-style bytes at the playback position', () => {
    expect([...(decodedWindow(fakeTrack(), 1, 3) ?? [])]).toEqual([65, 192, 65])
  })

  it('returns null outside the track', () => {
    expect(decodedWindow(fakeTrack(), 10, 3)).toBeNull()
    expect(decodedWindow(fakeTrack(), -1, 3)).toBeNull()
  })
})

describe('BufferPlayback', () => {
  it('tracks position from the audio clock and pauses in place', () => {
    const { context, nodes } = fakeContext()
    const playback = new BufferPlayback(context, {} as AudioNode, fakeTrack(), vi.fn())
    playback.play()
    expect(nodes[0].start).toHaveBeenCalledWith(0, 0)
    context.currentTime = 2.5
    expect(playback.currentTime).toBe(2.5)
    playback.pause()
    context.currentTime = 4
    expect(playback.currentTime).toBe(2.5)
    expect(nodes[0].stop).toHaveBeenCalled()
  })

  it('seeks by replacing the source node so the old position never keeps playing', () => {
    const { context, nodes } = fakeContext()
    const playback = new BufferPlayback(context, {} as AudioNode, fakeTrack(), vi.fn())
    playback.play()
    context.currentTime = 1
    playback.seek(7)
    expect(nodes[0].stop).toHaveBeenCalled()
    expect(nodes[0].onended).toBeNull()
    expect(nodes[1].start).toHaveBeenCalledWith(0, 7)
    expect(playback.currentTime).toBe(7)
  })

  it('reports the natural end once and restarts from the beginning afterwards', () => {
    const { context, nodes } = fakeContext()
    const ended = vi.fn()
    const playback = new BufferPlayback(context, {} as AudioNode, fakeTrack(), ended)
    playback.play()
    nodes[0].onended?.()
    expect(ended).toHaveBeenCalledTimes(1)
    expect(playback.isPlaying).toBe(false)
    playback.play()
    expect(nodes[1].start).toHaveBeenCalledWith(0, 0)
  })

  it('seeks while paused without starting playback', () => {
    const { context, nodes } = fakeContext()
    const playback = new BufferPlayback(context, {} as AudioNode, fakeTrack(), vi.fn())
    playback.seek(4)
    expect(nodes).toHaveLength(0)
    expect(playback.currentTime).toBe(4)
    playback.play()
    expect(nodes[0].start).toHaveBeenCalledWith(0, 4)
  })
})
