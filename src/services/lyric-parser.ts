import type { LyricLine } from '../domain/types'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]/g

function toMilliseconds(minutes: string, seconds: string, fraction?: string): number {
  const milliseconds = fraction
    ? Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10)
    : 0
  return Number.parseInt(minutes, 10) * 60_000
    + Number.parseInt(seconds, 10) * 1_000
    + milliseconds
}

function parseCredit(line: string): LyricLine | null {
  try {
    const value = JSON.parse(line) as { t?: unknown; c?: Array<{ tx?: unknown }> }
    if (!Array.isArray(value.c)) return null
    const text = value.c
      .map((chunk) => typeof chunk.tx === 'string' ? chunk.tx : '')
      .join('')
      .trim()
    if (!text) return null
    return {
      timeMs: typeof value.t === 'number' ? value.t : 0,
      text,
      kind: 'credit',
    }
  } catch {
    return null
  }
}

export function parseLrc(source: string): LyricLine[] {
  const result: LyricLine[] = []

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('{')) {
      const credit = parseCredit(line)
      if (credit) result.push(credit)
      continue
    }

    const tags = [...line.matchAll(TIME_TAG)]
    if (tags.length === 0) continue
    const lastTag = tags.at(-1)
    if (!lastTag) continue
    const text = line.slice((lastTag.index ?? 0) + lastTag[0].length).trim()
    if (!text) continue

    for (const tag of tags) {
      result.push({
        timeMs: toMilliseconds(tag[1], tag[2], tag[3]),
        text,
        kind: 'lyric',
      })
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs)
}

export function findActiveLyric(lines: LyricLine[], timeMs: number): number {
  let low = 0
  let high = lines.length - 1
  let answer = -1

  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].timeMs <= timeMs) {
      answer = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return answer
}
