import { describe, expect, it } from 'vitest'
import { sampleAmplitudes } from './waveform'

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
