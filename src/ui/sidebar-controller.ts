/** Right-edge presentation only; audio and playlist state stay in PlayerController. */
export class SidebarController {
  private readonly events = new AbortController()
  private timer?: ReturnType<typeof setTimeout>
  private collapsed = false
  private pinned = false
  private touchInteraction = false
  constructor(private host: HTMLElement, private card: HTMLElement, private edge: HTMLButtonElement, grip: HTMLButtonElement, private pin: HTMLButtonElement, close: HTMLButtonElement, collapsed: boolean) {
    const options = { signal: this.events.signal }
    host.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') {
        this.touchInteraction = false
        this.setCollapsed(false)
      }
    }, options)
    host.addEventListener('pointerdown', (event) => {
      this.touchInteraction = event.pointerType === 'touch'
    }, options)
    host.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch' && !this.touchInteraction) this.scheduleClose()
    }, options)
    host.addEventListener('focusin', () => this.setCollapsed(false), options)
    host.addEventListener('focusout', () => {
      if (!this.touchInteraction) this.scheduleClose(true)
    }, options)
    edge.addEventListener('click', () => this.setCollapsed(false), options)
    this.bindSwipe(edge, -1, () => this.setCollapsed(false), options)
    grip.addEventListener('click', () => this.close(), options)
    this.bindSwipe(grip, 1, () => this.close(), options)
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
  private bindSwipe(target: HTMLElement, direction: -1 | 1, finish: () => void, options: AddEventListenerOptions): void {
    let start: { pointerId: number; x: number; y: number } | undefined
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return
      start = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    }, options)
    target.addEventListener('pointerup', (event) => {
      if (!start || event.pointerId !== start.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      start = undefined
      if (dx * direction >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) finish()
    }, options)
    target.addEventListener('pointercancel', () => { start = undefined }, options)
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
