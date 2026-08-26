import type { PlaylistMode, PlayerTheme, Song } from './domain/types'
import { ArcueidMusicPlayer } from './player-element'
import type { DockSidePreference } from './ui/floating-player'

export interface CreateMusicPlayerOptions {
  target: ParentNode
  playlist?: readonly Song[]
  musicApi?: string
  playlistId?: string | number
  playMode?: 'order' | 'single' | 'random'
  playlistMode?: PlaylistMode
  collapsed?: boolean
  dockSide?: DockSidePreference
  rememberPosition?: boolean
  positionKey?: string
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
  const instanceId = ++instanceSequence
  if (options.playlist) element.playlist = [...options.playlist]
  if (options.musicApi) element.setAttribute('music-api', options.musicApi)
  if (options.playlistId !== undefined) element.setAttribute('playlist-id', String(options.playlistId))
  if (options.playMode) element.setAttribute('play-mode', options.playMode)
  if (options.playlistMode) element.setAttribute('playlist-mode', options.playlistMode)
  if (options.collapsed) element.setAttribute('collapsed', '')
  if (options.dockSide) element.setAttribute('dock-side', options.dockSide)
  if (options.rememberPosition) {
    element.setAttribute('remember-position', '')
    element.setAttribute('position-key', options.positionKey ?? `arcueid-music-player:position:${instanceId}`)
  }
  if (options.theme) element.setAttribute('theme', options.theme)
  if (options.volume !== undefined) element.setAttribute('volume', String(options.volume))
  if (options.rememberPlayback) {
    element.setAttribute('remember-playback', '')
    element.setAttribute('memory-key', options.memoryKey ?? `arcueid-music-player:instance:${instanceId}`)
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
