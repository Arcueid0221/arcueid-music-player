import type { PlayerState } from '../domain/types'

export type PlayerListener = (state: PlayerState, previous: PlayerState) => void

export interface PlayerStore {
  getState(): PlayerState
  setState(update: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>)): void
  subscribe(listener: PlayerListener): () => void
}

export function createPlayerStore(initialState: PlayerState): PlayerStore {
  let state = initialState
  const listeners = new Set<PlayerListener>()

  return {
    getState: () => state,
    setState(update) {
      const patch = typeof update === 'function' ? update(state) : update
      if (Object.keys(patch).every((key) => Object.is(state[key as keyof PlayerState], patch[key as keyof PlayerState]))) {
        return
      }
      const previous = state
      state = { ...state, ...patch }
      listeners.forEach((listener) => listener(state, previous))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
