import { describe, expect, it } from 'vitest'
import { resolveWaveformProgress, sampleAmplitudes } from './waveform'

describe('sampleAmplitudes', () => {
  it('always produces enough amplitudes to fill the requested width', () => {
    expect(sampleAmplitudes(null, 8)).toHaveLength(8)
    expect(sampleAmplitudes(new Uint8Array([128, 128, 128, 128]), 12)).toHaveLength(12)
  })

  it('keeps silent samples visible and preserves stronger peaks', () => {
    expect(sampleAmplitudes(new Uint8Array([128, 128]), 1)[0]).toBe(0.06)
    expect(sampleAmplitudes(new Uint8Array([0, 128, 255, 128]), 2)).toEqual([1, 127 / 128])
  })
})

describe('resolveWaveformProgress', () => {
  it('uses the drag preview without changing the real playback progress', () => {
    expect(resolveWaveformProgress(0.2, 0.75)).toBe(0.75)
    expect(resolveWaveformProgress(0.2, null)).toBe(0.2)
  })

  it('keeps preview progress inside the waveform bounds', () => {
    expect(resolveWaveformProgress(0.2, -1)).toBe(0)
    expect(resolveWaveformProgress(0.2, 2)).toBe(1)
  })
})
