import type { LyricLine, LyricWord } from '../domain/types'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]/g
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g

function toMilliseconds(minutes: string, seconds: string, fraction?: string): number {
  const milliseconds = fraction
    ? Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10)
    : 0
  return Number.parseInt(minutes, 10) * 60_000
    + Number.parseInt(seconds, 10) * 1_000
    + milliseconds
}

function parseWords(source: string): { text: string; words?: LyricWord[] } {
  const tags = [...source.matchAll(WORD_TAG)]
  if (!tags.length) return { text: source.trim() }
  const words = tags.flatMap((tag, index) => {
    const start = (tag.index ?? 0) + tag[0].length
    const end = tags[index + 1]?.index ?? source.length
    const text = source.slice(start, end)
    if (!text) return []
    return [{
      startMs: toMilliseconds(tag[1], tag[2], tag[3]),
      endMs: tags[index + 1]
        ? toMilliseconds(tags[index + 1][1], tags[index + 1][2], tags[index + 1][3])
        : undefined,
      text,
    }]
  })
  return { text: words.map((word) => word.text).join('').trim(), words }
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
    const parsed = parseWords(line.slice((lastTag.index ?? 0) + lastTag[0].length))
    if (!parsed.text) continue

    for (const tag of tags) {
      result.push({
        timeMs: toMilliseconds(tag[1], tag[2], tag[3]),
        text: parsed.text,
        kind: 'lyric',
        words: parsed.words,
      })
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs)
}

export function findActiveWord(line: LyricLine | undefined, timeMs: number): number {
  if (!line?.words?.length) return -1
  let active = -1
  for (let index = 0; index < line.words.length; index += 1) {
    if (line.words[index].startMs <= timeMs) active = index
    else break
  }
  return active
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
