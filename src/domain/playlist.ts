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
