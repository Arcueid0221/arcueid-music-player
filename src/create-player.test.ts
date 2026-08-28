import { describe, expect, it, vi } from 'vitest'
import { createMusicPlayer } from './create-player'

describe('createMusicPlayer', () => {
  it('explains the dynamic import requirement outside a browser', () => {
    expect(() => createMusicPlayer({ target: {} as ParentNode })).toThrow('SSR 请使用动态导入')
  })

  it('maps playlistConfig to the playlist-config attribute', () => {
    const element = {
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      remove: vi.fn(),
    }
    const target = { appendChild: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => element) })

    try {
      createMusicPlayer({
        target: target as unknown as ParentNode,
        playlistConfig: '/music/playlists.json',
      })
      expect(element.setAttribute).toHaveBeenCalledWith('playlist-config', '/music/playlists.json')
      expect(target.appendChild).toHaveBeenCalledWith(element)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
