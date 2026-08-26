export type DockSide = 'left' | 'right'
export type DockSidePreference = DockSide | 'auto'

export interface FloatingPoint {
  x: number
  y: number
}

export interface FloatingSize {
  width: number
  height: number
}

export interface FloatingInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface FloatingPlayerOptions {
  host: HTMLElement
  handles: HTMLElement[]
  collapseButton: HTMLButtonElement
  expandButton: HTMLButtonElement
  collapsed: boolean
  dockSide: DockSidePreference
  rememberPosition: boolean
  storageKey: string
}

interface StoredFloatingState extends FloatingPoint {
  dockSide: DockSide
  collapsed: boolean
}

const POSITION_MARGIN = 12

export function clampFloatingPosition(
  point: FloatingPoint,
  element: FloatingSize,
  viewport: FloatingSize,
  insets: FloatingInsets = { top: 0, right: 0, bottom: 0, left: 0 },
  margin = POSITION_MARGIN,
): FloatingPoint {
  const minX = insets.left + margin
  const minY = insets.top + margin
  const maxX = Math.max(minX, viewport.width - insets.right - element.width - margin)
  const maxY = Math.max(minY, viewport.height - insets.bottom - element.height - margin)
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  }
}

export function resolveDockSide(
  x: number,
  elementWidth: number,
  viewportWidth: number,
  preference: DockSidePreference,
): DockSide {
  if (preference !== 'auto') return preference
  return x + elementWidth / 2 <= viewportWidth / 2 ? 'left' : 'right'
}

export function resolveDockedX(
  side: DockSide,
  elementWidth: number,
  viewportWidth: number,
  insets: Pick<FloatingInsets, 'left' | 'right'> = { left: 0, right: 0 },
  margin = POSITION_MARGIN,
): number {
  return side === 'left'
    ? insets.left + margin
    : Math.max(insets.left + margin, viewportWidth - insets.right - elementWidth - margin)
}

export class FloatingPlayerController {
  private readonly events = new AbortController()
  private rememberPosition: boolean
  private dockPreference: DockSidePreference
  private dockSide: DockSide = 'left'
  private collapsed: boolean
  private activePointer?: {
    id: number
    handle: HTMLElement
    startX: number
    startY: number
    originX: number
    originY: number
  }

  constructor(private readonly options: FloatingPlayerOptions) {
    this.rememberPosition = options.rememberPosition
    this.dockPreference = options.dockSide
    this.collapsed = options.collapsed
    options.handles.forEach((handle) => this.bindHandle(handle))
    options.collapseButton.addEventListener('click', () => this.setCollapsed(true), { signal: this.events.signal })
    options.expandButton.addEventListener('click', () => this.setCollapsed(false), { signal: this.events.signal })
    window.addEventListener('resize', this.handleViewportChange, { signal: this.events.signal })
    window.visualViewport?.addEventListener('resize', this.handleViewportChange, { signal: this.events.signal })

    const restored = this.readStoredState()
    if (restored) {
      this.collapsed = restored.collapsed
      this.dockSide = restored.dockSide
    }
    this.applyCollapsedState(false)
    requestAnimationFrame(() => this.initializePosition(restored))
  }

  destroy(): void {
    this.events.abort()
  }

  setCollapsed(value: boolean): void {
    if (this.collapsed === value && this.options.host.hasAttribute('collapsed') === value) return
    this.collapsed = value
    this.applyCollapsedState(true)
    requestAnimationFrame(() => this.snapToDock(true))
  }

  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed)
  }

  setDockPreference(value: DockSidePreference): void {
    this.dockPreference = value
    requestAnimationFrame(() => this.snapToDock(true))
  }

  setRememberPosition(value: boolean): void {
    this.rememberPosition = value
    if (value) this.savePosition()
  }

  private bindHandle(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (event) => this.beginDrag(event, handle), { signal: this.events.signal })
    handle.addEventListener('pointermove', this.moveDrag, { signal: this.events.signal })
    handle.addEventListener('pointerup', this.endDrag, { signal: this.events.signal })
    handle.addEventListener('pointercancel', this.cancelDrag, { signal: this.events.signal })
    handle.addEventListener('keydown', this.moveWithKeyboard, { signal: this.events.signal })
  }

  private beginDrag(event: PointerEvent, handle: HTMLElement): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const rect = this.options.host.getBoundingClientRect()
    this.activePointer = {
      id: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    handle.setPointerCapture(event.pointerId)
    this.options.host.dataset.dragging = 'true'
    this.applyPosition({ x: rect.left, y: rect.top })
  }

  private readonly moveDrag = (event: PointerEvent): void => {
    const active = this.activePointer
    if (!active || active.id !== event.pointerId) return
    const point = this.clamp({
      x: active.originX + event.clientX - active.startX,
      y: active.originY + event.clientY - active.startY,
    })
    this.applyPosition(point)
  }

  private readonly endDrag = (event: PointerEvent): void => {
    const active = this.activePointer
    if (!active || active.id !== event.pointerId) return
    if (active.handle.hasPointerCapture(event.pointerId)) active.handle.releasePointerCapture(event.pointerId)
    this.activePointer = undefined
    this.options.host.dataset.dragging = 'false'
    this.snapToDock(true)
  }

  private readonly cancelDrag = (event: PointerEvent): void => {
    if (this.activePointer?.id !== event.pointerId) return
    this.activePointer = undefined
    this.options.host.dataset.dragging = 'false'
    this.snapToDock(false)
  }

  private readonly moveWithKeyboard = (event: KeyboardEvent): void => {
    const deltas: Record<string, FloatingPoint> = {
      ArrowLeft: { x: -16, y: 0 },
      ArrowRight: { x: 16, y: 0 },
      ArrowUp: { x: 0, y: -16 },
      ArrowDown: { x: 0, y: 16 },
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      this.dockPreference = event.key === 'Home' ? 'left' : 'right'
      this.snapToDock(true)
      return
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    const rect = this.options.host.getBoundingClientRect()
    this.applyPosition(this.clamp({ x: rect.left + delta.x, y: rect.top + delta.y }))
    this.snapToDock(true)
  }

  private initializePosition(restored?: StoredFloatingState): void {
    if (restored) {
      this.applyPosition(this.clamp(restored))
      this.snapToDock(false)
      return
    }
    const rect = this.options.host.getBoundingClientRect()
    this.applyPosition(this.clamp({ x: rect.left, y: rect.top }))
    this.snapToDock(false)
  }

  private snapToDock(emit: boolean): void {
    const host = this.options.host
    const rect = host.getBoundingClientRect()
    const viewport = this.viewportSize()
    const insets = this.safeInsets()
    this.dockSide = resolveDockSide(rect.left, rect.width, viewport.width, this.dockPreference)
    host.dataset.dockSide = this.dockSide
    const point = this.clamp({
      x: resolveDockedX(this.dockSide, rect.width, viewport.width, insets),
      y: rect.top,
    })
    this.applyPosition(point)
    this.savePosition()
    if (emit) this.dispatchPositionChange(point)
  }

  private clamp(point: FloatingPoint): FloatingPoint {
    const rect = this.options.host.getBoundingClientRect()
    return clampFloatingPosition(point, rect, this.viewportSize(), this.safeInsets())
  }

  private applyPosition(point: FloatingPoint): void {
    const style = this.options.host.style
    style.left = `${Math.round(point.x)}px`
    style.top = `${Math.round(point.y)}px`
    style.right = 'auto'
    style.bottom = 'auto'
  }

  private applyCollapsedState(emit: boolean): void {
    const host = this.options.host
    host.toggleAttribute('collapsed', this.collapsed)
    this.options.collapseButton.setAttribute('aria-expanded', String(!this.collapsed))
    this.options.expandButton.setAttribute('aria-expanded', String(!this.collapsed))
    if (emit) {
      host.dispatchEvent(new CustomEvent('collapsechange', {
        bubbles: true,
        composed: true,
        detail: { collapsed: this.collapsed },
      }))
    }
  }

  private readonly handleViewportChange = (): void => {
    requestAnimationFrame(() => this.snapToDock(true))
  }

  private viewportSize(): FloatingSize {
    return {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    }
  }

  private safeInsets(): FloatingInsets {
    const style = getComputedStyle(this.options.host)
    const read = (name: string): number => Number.parseFloat(style.getPropertyValue(name)) || 0
    return {
      top: read('--player-safe-top'),
      right: read('--player-safe-right'),
      bottom: read('--player-safe-bottom'),
      left: read('--player-safe-left'),
    }
  }

  private savePosition(): void {
    if (!this.rememberPosition) return
    const rect = this.options.host.getBoundingClientRect()
    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify({
        x: rect.left,
        y: rect.top,
        dockSide: this.dockSide,
        collapsed: this.collapsed,
      } satisfies StoredFloatingState))
    } catch {
      // Storage is optional; private browsing and embedded contexts may reject it.
    }
  }

  private readStoredState(): StoredFloatingState | undefined {
    if (!this.rememberPosition) return undefined
    try {
      const value = JSON.parse(localStorage.getItem(this.options.storageKey) ?? 'null') as Partial<StoredFloatingState> | null
      if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined
      return {
        x: Number(value.x),
        y: Number(value.y),
        dockSide: value.dockSide === 'right' ? 'right' : 'left',
        collapsed: value.collapsed === true,
      }
    } catch {
      return undefined
    }
  }

  private dispatchPositionChange(point: FloatingPoint): void {
    this.options.host.dispatchEvent(new CustomEvent('positionchange', {
      bubbles: true,
      composed: true,
      detail: { ...point, dockSide: this.dockSide },
    }))
  }
}
