import { describe, expect, it } from 'vitest'
import {
  clampIndex,
  indexAfterMove,
  indexAfterRemoval,
  moveItem,
  nextIndex,
  previousIndex,
  randomIndex,
} from './playlist'

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

describe('playlist editing', () => {
  it('moves an item without mutating the input', () => {
    const source = ['a', 'b', 'c']
    expect(moveItem(source, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(source).toEqual(['a', 'b', 'c'])
  })

  it('keeps the current index attached to the same item after moving', () => {
    expect(indexAfterMove(1, 0, 2)).toBe(0)
    expect(indexAfterMove(1, 2, 0)).toBe(2)
    expect(indexAfterMove(1, 1, 2)).toBe(2)
  })

  it('chooses the nearest valid current index after removal', () => {
    expect(indexAfterRemoval(2, 0, 2)).toBe(1)
    expect(indexAfterRemoval(1, 1, 2)).toBe(1)
    expect(indexAfterRemoval(0, 0, 0)).toBe(-1)
  })
})
