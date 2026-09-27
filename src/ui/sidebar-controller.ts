/** Right-edge presentation only; audio and playlist state stay in PlayerController. */
export class SidebarController {
  private readonly events = new AbortController()
  private timer?: ReturnType<typeof setTimeout>
  private collapsed = false
  private pinned = false
  constructor(private host: HTMLElement, private card: HTMLElement, private edge: HTMLButtonElement, private pin: HTMLButtonElement, close: HTMLButtonElement, collapsed: boolean) {
    const options = { signal: this.events.signal }
    host.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') this.setCollapsed(false)
    }, options)
    host.addEventListener('pointerleave', () => this.scheduleClose(), options)
    host.addEventListener('focusin', () => this.setCollapsed(false), options)
    host.addEventListener('focusout', () => this.scheduleClose(true), options)
    edge.addEventListener('click', () => this.setCollapsed(false), options)
    pin.addEventListener('click', () => {
      this.pinned = !this.pinned
      this.updatePin()
      this.setCollapsed(false)
    }, options)
    close.addEventListener('click', () => this.close(), options)
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); this.close() }
    }, options)
    document.addEventListener('pointerdown', (event) => {
      if (!event.composedPath().includes(host) && !this.pinned) this.setCollapsed(true)
    }, options)
    this.updatePin()
    this.setCollapsed(collapsed)
  }
  private close(): void {
    this.pinned = false
    this.updatePin()
    this.setCollapsed(true)
  }
  private updatePin(): void {
    this.pin.setAttribute('aria-pressed', String(this.pinned))
    this.pin.setAttribute('aria-label', this.pinned ? '取消固定播放器' : '固定播放器')
    this.pin.title = this.pinned ? '取消固定播放器' : '固定播放器'
  }
  private scheduleClose(respectFocus = false): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      if (!this.pinned && (!respectFocus || !this.host.matches(':focus-within')) && !this.host.matches(':hover')) this.setCollapsed(true)
    }, 350)
  }
  setCollapsed(value: boolean): void {
    clearTimeout(this.timer)
    if (value && this.pinned) return
    this.collapsed = value
    this.host.toggleAttribute('collapsed', value)
    this.card.inert = value
    this.edge.setAttribute('aria-expanded', String(!value))
  }
  toggleCollapsed(): void { this.setCollapsed(!this.collapsed) }
  destroy(): void { clearTimeout(this.timer); this.events.abort() }
}
