import { describe, expect, it, vi } from 'vitest'
import { PlaybackLifecycleService } from './playback-lifecycle'

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible'
}

describe('PlaybackLifecycleService', () => {
  it('persists on backgrounding and resumes when playback was intended', async () => {
    const visibility = new VisibilityTarget()
    const page = new EventTarget()
    const persist = vi.fn()
    const resume = vi.fn(async () => undefined)
    const service = new PlaybackLifecycleService(visibility, page)
    const disconnect = service.connect({ persist, resume })

    service.setPlaybackIntent(true)
    visibility.visibilityState = 'hidden'
    visibility.dispatchEvent(new Event('visibilitychange'))
    visibility.visibilityState = 'visible'
    visibility.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(persist).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledOnce()
    disconnect()
  })

  it('does not restart playback after an explicit pause', async () => {
    const visibility = new VisibilityTarget()
    const page = new EventTarget()
    const resume = vi.fn()
    const service = new PlaybackLifecycleService(visibility, page)
    service.connect({ persist: vi.fn(), resume })

    service.setPlaybackIntent(true)
    service.setPlaybackIntent(false)
    page.dispatchEvent(new Event('pageshow'))
    await Promise.resolve()

    expect(resume).not.toHaveBeenCalled()
  })
})
