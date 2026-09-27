import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarController } from './sidebar-controller'
class ElementStub extends EventTarget {
  attrs = new Map<string, string>()
  inert = false
  title = ''
  focused = false
  matches(query: string) { return query === ':focus-within' && this.focused }
  setAttribute(key: string, value: string) { this.attrs.set(key, value) }
  toggleAttribute(key: string, value: boolean) { if (value) this.attrs.set(key, ''); else this.attrs.delete(key) }
}
function setup() {
  vi.useFakeTimers()
  vi.stubGlobal('document', new EventTarget())
  const host = new ElementStub(), card = new ElementStub(), edge = new ElementStub(), pin = new ElementStub(), close = new ElementStub()
  const controller = new SidebarController(host as unknown as HTMLElement, card as unknown as HTMLElement, edge as unknown as HTMLButtonElement, pin as unknown as HTMLButtonElement, close as unknown as HTMLButtonElement, true)
  return { host, card, edge, pin, close, controller }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('sidebar presentation', () => {
  it('opens on entry and closes after the exit delay even after mouse focus', () => {
    const x = setup()
    expect(x.card.inert).toBe(true)
    x.host.dispatchEvent(new Event('pointerenter'))
    expect(x.card.inert).toBe(false)
    x.host.focused = true
    x.host.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(349)
    expect(x.card.inert).toBe(false)
    vi.advanceTimersByTime(1)
    expect(x.card.inert).toBe(true)
    x.controller.destroy()
  })
  it('pin prevents auto hide and explicit collapse unpins', () => {
    const x = setup()
    x.pin.dispatchEvent(new Event('click'))
    x.host.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(400)
    expect(x.card.inert).toBe(false)
    expect(x.pin.attrs.get('aria-pressed')).toBe('true')
    x.close.dispatchEvent(new Event('click'))
    expect(x.card.inert).toBe(true)
    expect(x.pin.attrs.get('aria-pressed')).toBe('false')
    x.controller.destroy()
  })
  it('re-entry cancels pending close and destroy cancels listeners and timer', () => {
    const x = setup()
    x.edge.dispatchEvent(new Event('click'))
    x.host.dispatchEvent(new Event('pointerleave'))
    x.host.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(400)
    expect(x.card.inert).toBe(false)
    x.host.dispatchEvent(new Event('pointerleave'))
    x.controller.destroy()
    vi.advanceTimersByTime(400)
    expect(x.card.inert).toBe(false)
    x.close.dispatchEvent(new Event('click'))
    expect(x.card.inert).toBe(false)
  })
})
