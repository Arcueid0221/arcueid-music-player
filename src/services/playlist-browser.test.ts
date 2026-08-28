import { describe, expect, it, vi } from 'vitest'
import type { PlaylistCatalogProvider } from './playlist-catalog-provider'
import { PlaylistBrowser } from './playlist-browser'

function createProvider() {
  return {
    listPlaylists: vi.fn(async () => [
      { id: 'first', name: 'First' },
      { id: 'default', name: 'Default', isDefault: true },
      { id: 'other', name: 'Other' },
    ]),
    getPlaylist: vi.fn(async (id: string | number) => ({
      id,
      name: `${id} playlist`,
      songs: [{ id: `${id}-song`, title: `${id} song`, src: `/${id}.mp3` }],
    })),
    load: vi.fn(),
  } as unknown as PlaylistCatalogProvider
}

describe('PlaylistBrowser', () => {
  it('opens the default playlist tracks on initialization', async () => {
    const provider = createProvider()
    const browser = new PlaylistBrowser(provider)

    await expect(browser.initialize()).resolves.toEqual({
      playlist: expect.objectContaining({ id: 'default' }),
      songs: [expect.objectContaining({ id: 'default-song' })],
    })
    expect(browser.getState()).toEqual(expect.objectContaining({
      view: 'tracks',
      playbackPlaylistId: 'default',
      selectedPlaylist: expect.objectContaining({ id: 'default' }),
    }))
  })

  it('browses another playlist without changing the playback playlist', async () => {
    const provider = createProvider()
    const browser = new PlaylistBrowser(provider)
    await browser.initialize()

    browser.showPlaylists()
    expect(browser.getState().view).toBe('playlists')
    await browser.browse('other')

    expect(browser.getState()).toEqual(expect.objectContaining({
      view: 'tracks',
      playbackPlaylistId: 'default',
      selectedPlaylist: expect.objectContaining({ id: 'other' }),
      songs: [expect.objectContaining({ id: 'other-song' })],
    }))

    browser.markPlaybackPlaylist('other')
    expect(browser.getState().playbackPlaylistId).toBe('other')
  })

  it('caches playlist details while navigating between levels', async () => {
    const provider = createProvider()
    const browser = new PlaylistBrowser(provider)
    await browser.initialize('other')
    browser.showPlaylists()
    await browser.browse('other')

    expect(provider.getPlaylist).toHaveBeenCalledTimes(1)
  })
})
