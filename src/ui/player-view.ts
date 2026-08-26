import type { PlayerController } from '../core/player-controller'
import type { PlayerStore } from '../core/player-store'
import type { PlayerState, Song } from '../domain/types'
import type { AudioEngine } from '../core/audio-engine'
import { LyricView } from './components/lyric-view'
import { WaveformRenderer } from './components/waveform'

const MODE_LABEL = {
  order: '顺序播放',
  single: '单曲循环',
  random: '随机播放',
} as const

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '00:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export class PlayerView {
  private readonly eventController = new AbortController()
  private readonly waveform: WaveformRenderer
  private readonly lyricView: LyricView
  private readonly unsubscribe: () => void
  private lastPlaylist?: Song[]
  private lastIndex = -1

  private readonly title: HTMLElement
  private readonly artist: HTMLElement
  private readonly status: HTMLElement
  private readonly currentTime: HTMLElement
  private readonly duration: HTMLElement
  private readonly playButton: HTMLButtonElement
  private readonly modeButton: HTMLButtonElement
  private readonly muteButton: HTMLButtonElement
  private readonly volumeInput: HTMLInputElement
  private readonly lyricButton: HTMLButtonElement
  private readonly queueButton: HTMLButtonElement
  private readonly panel: HTMLElement
  private readonly panelTitle: HTMLElement
  private readonly lyricContainer: HTMLElement
  private readonly queueContainer: HTMLElement
  private readonly canvas: HTMLCanvasElement

  constructor(
    private readonly root: ShadowRoot,
    private readonly store: PlayerStore,
    private readonly controller: PlayerController,
    engine: AudioEngine,
  ) {
    root.innerHTML += `
      <section class="player-card" aria-label="音乐播放器">
        <div class="accent-strip" aria-hidden="true"></div>
        <header class="track-header">
          <div class="track-copy">
            <span class="eyebrow">ARCUEID PLAYER</span>
            <h2 class="track-title"></h2>
            <p class="track-artist"></p>
          </div>
          <span class="playback-status" role="status"></span>
        </header>

        <button class="waveform-button" type="button" aria-label="调整播放进度">
          <canvas class="waveform" height="54"></canvas>
        </button>
        <div class="time-row">
          <span class="current-time">00:00</span>
          <span class="duration">00:00</span>
        </div>

        <nav class="transport" aria-label="播放控制">
          <button type="button" data-action="previous">上一首</button>
          <button class="primary-control" type="button" data-action="toggle">播放</button>
          <button type="button" data-action="next">下一首</button>
        </nav>

        <div class="utility-row">
          <button type="button" data-action="mode"></button>
          <label class="volume-control">
            <span class="sr-only">音量</span>
            <input type="range" min="0" max="1" step="0.01" data-action="volume" />
          </label>
          <button type="button" data-action="mute">静音</button>
        </div>

        <div class="panel-actions">
          <button type="button" data-panel="lyrics">歌词</button>
          <button type="button" data-panel="queue">歌单</button>
        </div>

        <section class="detail-panel" hidden>
          <div class="panel-heading">
            <h3></h3>
            <button type="button" data-action="close-panel">收起</button>
          </div>
          <div class="lyric-list"></div>
          <div class="queue-list"></div>
        </section>
      </section>
    `

    this.title = this.get('.track-title')
    this.artist = this.get('.track-artist')
    this.status = this.get('.playback-status')
    this.currentTime = this.get('.current-time')
    this.duration = this.get('.duration')
    this.playButton = this.get('[data-action="toggle"]')
    this.modeButton = this.get('[data-action="mode"]')
    this.muteButton = this.get('[data-action="mute"]')
    this.volumeInput = this.get('[data-action="volume"]')
    this.lyricButton = this.get('[data-panel="lyrics"]')
    this.queueButton = this.get('[data-panel="queue"]')
    this.panel = this.get('.detail-panel')
    this.panelTitle = this.get('.panel-heading h3')
    this.lyricContainer = this.get('.lyric-list')
    this.queueContainer = this.get('.queue-list')
    this.canvas = this.get('.waveform')

    this.waveform = new WaveformRenderer(this.canvas)
    this.lyricView = new LyricView(this.lyricContainer, (seconds) => controller.seek(seconds))
    this.bindEvents()
    this.unsubscribe = store.subscribe((state) => this.render(state, engine))
    this.render(store.getState(), engine)
  }

  destroy(): void {
    this.eventController.abort()
    this.unsubscribe()
    this.waveform.destroy()
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action
      if (action === 'previous') void this.controller.previous()
      if (action === 'toggle') void this.controller.toggle()
      if (action === 'next') void this.controller.next()
      if (action === 'mode') this.controller.cyclePlayMode()
      if (action === 'mute') this.controller.toggleMuted()
      if (action === 'close-panel') {
        const panel = this.store.getState().panel
        if (panel) this.controller.togglePanel(panel)
      }

      const panel = target.closest<HTMLButtonElement>('[data-panel]')?.dataset.panel
      if (panel === 'lyrics' || panel === 'queue') this.controller.togglePanel(panel)

      const songButton = target.closest<HTMLButtonElement>('[data-song-index]')
      if (songButton) void this.controller.select(Number(songButton.dataset.songIndex))
    }, { signal: this.eventController.signal })

    this.volumeInput.addEventListener('input', () => {
      this.controller.setVolume(Number(this.volumeInput.value))
    }, { signal: this.eventController.signal })

    const waveformButton = this.get<HTMLButtonElement>('.waveform-button')
    waveformButton.addEventListener('pointerenter', () => this.waveform.setHovering(true), { signal: this.eventController.signal })
    waveformButton.addEventListener('pointerleave', () => this.waveform.setHovering(false), { signal: this.eventController.signal })
    waveformButton.addEventListener('click', (event) => {
      const rect = waveformButton.getBoundingClientRect()
      this.controller.seekRatio((event.clientX - rect.left) / rect.width)
    }, { signal: this.eventController.signal })
  }

  private render(state: PlayerState, engine: AudioEngine): void {
    const song = state.playlist[state.currentIndex]
    this.title.textContent = song?.title ?? '等待添加歌曲'
    this.artist.textContent = [song?.artist, song?.album].filter(Boolean).join(' · ') || '未知艺术家'
    this.status.textContent = state.error
      ? '播放出错'
      : state.isLoading
        ? '载入中'
        : state.isPlaying
          ? '正在播放'
          : '已暂停'
    this.status.classList.toggle('is-error', Boolean(state.error))
    this.status.title = state.error ?? ''
    this.currentTime.textContent = formatTime(state.currentTime)
    this.duration.textContent = formatTime(state.duration || song?.duration || 0)
    this.playButton.textContent = state.isPlaying ? '暂停' : '播放'
    this.playButton.setAttribute('aria-pressed', String(state.isPlaying))
    this.modeButton.textContent = MODE_LABEL[state.playMode]
    this.muteButton.textContent = state.muted ? '取消静音' : '静音'
    this.volumeInput.value = String(state.volume)

    const progress = () => state.duration > 0 ? state.currentTime / state.duration : 0
    this.waveform.refresh(progress)
    if (state.isPlaying) this.waveform.start(() => engine.getFrequencyData(), () => {
      const latest = this.store.getState()
      return latest.duration > 0 ? latest.currentTime / latest.duration : 0
    })
    else this.waveform.stop()

    this.renderPanel(state)
    this.lyricView.setLines(state.lyrics)
    this.lyricView.setActive(state.activeLyricIndex)
    this.lyricButton.classList.toggle('is-active', state.panel === 'lyrics')
    this.queueButton.classList.toggle('is-active', state.panel === 'queue')

    if (this.lastPlaylist !== state.playlist || this.lastIndex !== state.currentIndex) {
      this.renderQueue(state)
      this.lastPlaylist = state.playlist
      this.lastIndex = state.currentIndex
    }
  }

  private renderPanel(state: PlayerState): void {
    this.panel.hidden = state.panel === null
    this.panelTitle.textContent = state.panel === 'lyrics' ? '同步歌词' : '播放队列'
    this.lyricContainer.hidden = state.panel !== 'lyrics'
    this.queueContainer.hidden = state.panel !== 'queue'
  }

  private renderQueue(state: PlayerState): void {
    this.queueContainer.replaceChildren()
    state.playlist.forEach((song, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'queue-item'
      button.dataset.songIndex = String(index)
      button.classList.toggle('is-current', index === state.currentIndex)
      button.setAttribute('aria-current', index === state.currentIndex ? 'true' : 'false')

      const number = document.createElement('span')
      number.className = 'queue-number'
      number.textContent = String(index + 1).padStart(2, '0')
      const copy = document.createElement('span')
      copy.className = 'queue-copy'
      const title = document.createElement('strong')
      title.textContent = song.title
      const artist = document.createElement('small')
      artist.textContent = song.artist || '未知艺术家'
      copy.append(title, artist)
      button.append(number, copy)
      this.queueContainer.append(button)
    })
  }

  private get<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing player element: ${selector}`)
    return element
  }
}
