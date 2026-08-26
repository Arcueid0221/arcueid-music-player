import type { PlayerTheme, Song } from './domain/types'
import { ArcueidMusicPlayer } from './player-element'

export interface CreateMusicPlayerOptions {
  target: ParentNode
  playlist?: readonly Song[]
  playMode?: 'order' | 'single' | 'random'
  theme?: PlayerTheme
  volume?: number
  rememberPlayback?: boolean
  memoryKey?: string
  onReady?: (player: ArcueidMusicPlayer) => void
  onDestroy?: () => void
}

export interface MusicPlayerInstance {
  readonly element: ArcueidMusicPlayer
  destroy(): void
}

let instanceSequence = 0

export function createMusicPlayer(options: CreateMusicPlayerOptions): MusicPlayerInstance {
  if (typeof document === 'undefined') throw new Error('createMusicPlayer() 只能在浏览器中调用；SSR 请使用动态导入')
  const element = document.createElement('arcueid-music-player') as ArcueidMusicPlayer
  if (options.playlist) element.playlist = [...options.playlist]
  if (options.playMode) element.setAttribute('play-mode', options.playMode)
  if (options.theme) element.setAttribute('theme', options.theme)
  if (options.volume !== undefined) element.setAttribute('volume', String(options.volume))
  if (options.rememberPlayback) {
    element.setAttribute('remember-playback', '')
    element.setAttribute('memory-key', options.memoryKey ?? `arcueid-music-player:instance:${++instanceSequence}`)
  }
  if (options.onReady) element.addEventListener('ready', () => options.onReady?.(element), { once: true })
  options.target.appendChild(element)

  let destroyed = false
  return {
    element,
    destroy() {
      if (destroyed) return
      destroyed = true
      element.remove()
      options.onDestroy?.()
    },
  }
}
