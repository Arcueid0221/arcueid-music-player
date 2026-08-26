import type { PlayMode } from './types'

export function clampIndex(length: number, index: number): number {
  if (length <= 0) return -1
  return Math.min(Math.max(Math.trunc(index), 0), length - 1)
}

export function randomIndex(
  length: number,
  current: number,
  random: () => number = Math.random,
): number {
  if (length <= 1) return length === 1 ? 0 : -1
  const offset = Math.floor(random() * (length - 1)) + 1
  return (clampIndex(length, current) + offset) % length
}

export function nextIndex(
  length: number,
  current: number,
  mode: PlayMode,
  random: () => number = Math.random,
): number {
  if (length <= 0) return -1
  const safeCurrent = clampIndex(length, current)
  return mode === 'random'
    ? randomIndex(length, safeCurrent, random)
    : (safeCurrent + 1) % length
}

export function previousIndex(
  length: number,
  current: number,
  mode: PlayMode,
  random: () => number = Math.random,
): number {
  if (length <= 0) return -1
  const safeCurrent = clampIndex(length, current)
  return mode === 'random'
    ? randomIndex(length, safeCurrent, random)
    : (safeCurrent - 1 + length) % length
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function indexAfterMove(current: number, from: number, to: number): number {
  if (current === from) return to
  if (from < current && to >= current) return current - 1
  if (from > current && to <= current) return current + 1
  return current
}

export function indexAfterRemoval(current: number, removed: number, nextLength: number): number {
  if (nextLength <= 0) return -1
  if (removed < current) return current - 1
  if (removed === current) return Math.min(current, nextLength - 1)
  return current
}
