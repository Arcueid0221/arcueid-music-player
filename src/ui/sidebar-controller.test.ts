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
  const host = new ElementStub(), card = new ElementStub(), edge = new ElementStub(), grip = new ElementStub(), pin = new ElementStub(), close = new ElementStub()
  const controller = new SidebarController(host as unknown as HTMLElement, card as unknown as HTMLElement, edge as unknown as HTMLButtonElement, grip as unknown as HTMLButtonElement, pin as unknown as HTMLButtonElement, close as unknown as HTMLButtonElement, true)
  return { host, card, edge, grip, pin, close, controller }
}
function touch(type: string, x: number, y: number) {
  const event = new Event(type)
  Object.assign(event, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y })
  return event
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
  it('opens with a left swipe on the edge and closes with a right swipe on the grip', () => {
    const x = setup()
    x.edge.dispatchEvent(touch('pointerdown', 100, 100))
    x.edge.dispatchEvent(touch('pointerup', 45, 106))
    expect(x.card.inert).toBe(false)
    x.grip.dispatchEvent(touch('pointerdown', 40, 100))
    x.grip.dispatchEvent(touch('pointerup', 100, 104))
    expect(x.card.inert).toBe(true)
    x.controller.destroy()
  })
  it('ignores a vertical touch on the edge', () => {
    const x = setup()
    x.edge.dispatchEvent(touch('pointerdown', 100, 100))
    x.edge.dispatchEvent(touch('pointerup', 91, 160))
    expect(x.card.inert).toBe(true)
    x.controller.destroy()
  })
  it('keeps the panel open after touching a song until the user taps outside', () => {
    const x = setup()
    x.edge.dispatchEvent(new Event('click'))
    x.host.dispatchEvent(touch('pointerdown', 120, 260))
    x.host.dispatchEvent(touch('pointerleave', 120, 260))
    x.host.dispatchEvent(new Event('focusout'))
    vi.advanceTimersByTime(400)
    expect(x.card.inert).toBe(false)
    document.dispatchEvent(new Event('pointerdown'))
    expect(x.card.inert).toBe(true)
    x.controller.destroy()
  })
})
