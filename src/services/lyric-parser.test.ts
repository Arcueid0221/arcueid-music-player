import { describe, expect, it } from 'vitest'
import { findActiveLyric, findActiveWord, parseLrc } from './lyric-parser'

describe('parseLrc', () => {
  it('parses credits, multiple time tags and millisecond variants', () => {
    const lines = parseLrc([
      '{"t":0,"c":[{"tx":"作词: "},{"tx":"椎名林檎"}]}',
      '[00:01.2][00:02.250]同一句',
      '[01:03:50]冒号小数',
    ].join('\n'))

    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual({ timeMs: 0, text: '作词: 椎名林檎', kind: 'credit' })
    expect(lines[1].timeMs).toBe(1200)
    expect(lines[2].timeMs).toBe(2250)
    expect(lines[3].timeMs).toBe(63_500)
  })

  it('parses enhanced LRC word timestamps', () => {
    const [line] = parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world')
    expect(line.text).toBe('Hello world')
    expect(line.words).toEqual([
      { startMs: 1_000, endMs: 1_500, text: 'Hello ' },
      { startMs: 1_500, endMs: undefined, text: 'world' },
    ])
    expect(findActiveWord(line, 1_499)).toBe(0)
    expect(findActiveWord(line, 1_500)).toBe(1)
  })
})

describe('findActiveLyric', () => {
  const lines = parseLrc('[00:01.00]A\n[00:03.00]B\n[00:05.00]C')

  it('returns the last line at or before the current time', () => {
    expect(findActiveLyric(lines, 500)).toBe(-1)
    expect(findActiveLyric(lines, 1_000)).toBe(0)
    expect(findActiveLyric(lines, 4_999)).toBe(1)
    expect(findActiveLyric(lines, 8_000)).toBe(2)
  })
})
