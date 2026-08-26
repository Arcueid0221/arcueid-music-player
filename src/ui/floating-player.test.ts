import { describe, expect, it } from 'vitest'
import { clampFloatingPosition, resolveDockedX, resolveDockSide } from './floating-player'

describe('floating player geometry', () => {
  it('keeps the player inside the viewport and safe-area insets', () => {
    expect(clampFloatingPosition(
      { x: -50, y: 900 },
      { width: 320, height: 200 },
      { width: 390, height: 844 },
      { top: 20, right: 0, bottom: 34, left: 0 },
    )).toEqual({ x: 12, y: 598 })
  })

  it('selects the nearest side unless the host forces one', () => {
    expect(resolveDockSide(20, 120, 400, 'auto')).toBe('left')
    expect(resolveDockSide(260, 120, 400, 'auto')).toBe('right')
    expect(resolveDockSide(20, 120, 400, 'right')).toBe('right')
  })

  it('computes a docked x position with side-specific safe areas', () => {
    expect(resolveDockedX('left', 120, 400, { left: 8, right: 16 })).toBe(20)
    expect(resolveDockedX('right', 120, 400, { left: 8, right: 16 })).toBe(252)
  })
})
