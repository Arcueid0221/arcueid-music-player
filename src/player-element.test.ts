import { describe, expect, it } from 'vitest'
import { resolvePlaylistMode } from './player-element'

describe('resolvePlaylistMode', () => {
  it('defaults the visitor-facing player to readonly', () => {
    expect(resolvePlaylistMode(null)).toBe('readonly')
    expect(resolvePlaylistMode('unknown')).toBe('readonly')
  })

  it('keeps the legacy management UI available as an explicit opt-in', () => {
    expect(resolvePlaylistMode('editable')).toBe('editable')
  })
})
