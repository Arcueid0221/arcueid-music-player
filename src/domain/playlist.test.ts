import { describe, expect, it } from 'vitest'
import { clampIndex, nextIndex, previousIndex, randomIndex } from './playlist'

describe('playlist navigation', () => {
  it('clamps invalid indexes', () => {
    expect(clampIndex(3, -2)).toBe(0)
    expect(clampIndex(3, 8)).toBe(2)
    expect(clampIndex(0, 0)).toBe(-1)
  })

  it('wraps ordered navigation', () => {
    expect(nextIndex(3, 2, 'order')).toBe(0)
    expect(previousIndex(3, 0, 'single')).toBe(2)
  })

  it('keeps random navigation away from the current song', () => {
    expect(randomIndex(4, 1, () => 0)).toBe(2)
    expect(randomIndex(4, 1, () => 0.999)).toBe(0)
    expect(nextIndex(4, 1, 'random', () => 0)).toBe(2)
  })
})
