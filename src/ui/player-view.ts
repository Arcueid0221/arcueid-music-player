import { AudioAnalysisSource } from '../core/audio-analysis-source'
import type { AudioEngine } from '../core/audio-engine'
import type { PlayerController } from '../core/player-controller'
import type { PlayerStore } from '../core/player-store'
import type { PlayMode, PlayerState, Song } from '../domain/types'
import { FilePlaylistProvider } from '../services/playlist-provider'
import { createPlayerIcon, setButtonIcon, type PlayerIcon } from './components/icon'
import { LyricView } from './components/lyric-view'
import { NowPlayingRail } from './components/now-playing-rail'
import { WaveformRenderer } from './components/waveform'

const MODE_CONTROL: Record<PlayMode, { label: string; icon: PlayerIcon }> = {
  order: { label: '顺序播放', icon: 'repeat' },
  single: { label: '单曲循环', icon: 'repeat-one' },
  random: { label: '随机播放', icon: 'shuffle' },
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '00:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export class PlayerView {
  private readonly eventController = new AbortController()
  private readonly waveform: WaveformRenderer
  private readonly nowPlayingRail: NowPlayingRail
  private readonly analysisSource: AudioAnalysisSource
  private readonly lyricView: LyricView
  private readonly unsubscribe: () => void
  private readonly unsubscribeAnalysis: () => void
  private lastPlaylist?: Song[]
  private lastIndex = -1
  private lastPlaying?: boolean
  private lastMode?: PlayMode
  private lastMuted?: boolean
  private lastPanel?: PlayerState['panel']
  private draggingWaveform = false
  private waveformPreviewRatio: number | null = null
  private draggedSongIndex = -1
  private queueQuery = ''

  private readonly title: HTMLElement
  private readonly artist: HTMLElement
  private readonly status: HTMLElement
  private readonly errorBanner: HTMLElement
  private readonly errorMessage: HTMLElement
  private readonly retryButton: HTMLButtonElement
  private readonly skipButton: HTMLButtonElement
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
  private readonly queueToolbar: HTMLElement
  private readonly lyricToolbar: HTMLElement
  private readonly lyricOffset: HTMLElement
  private readonly queueSearch: HTMLInputElement
  private readonly queueFeedback: HTMLElement
  private readonly playlistFileInput: HTMLInputElement
  private readonly waveformControl: HTMLElement

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

        <div class="error-banner" role="alert" hidden>
          <span class="error-message"></span>
          <span class="error-actions">
            <button class="icon-button compact-control" type="button" data-action="retry"></button>
            <button class="icon-button compact-control" type="button" data-action="skip-failed"></button>
          </span>
        </div>

        <div
          class="waveform-control"
          role="slider"
          tabindex="0"
          aria-label="播放进度"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-keyshortcuts="ArrowLeft ArrowRight Home End"
        >
          <canvas class="waveform" height="58" aria-hidden="true"></canvas>
        </div>
        <div class="time-row">
          <span class="current-time">00:00</span>
          <span class="duration">00:00</span>
        </div>

        <nav class="transport" aria-label="播放控制">
          <button class="icon-button" type="button" data-action="previous"></button>
          <button class="icon-button primary-control" type="button" data-action="toggle"></button>
          <button class="icon-button" type="button" data-action="next"></button>
        </nav>

        <div class="utility-row">
          <button class="icon-button" type="button" data-action="mode"></button>
          <label class="volume-control">
            <span class="sr-only">音量</span>
            <input type="range" min="0" max="1" step="0.01" data-action="volume" aria-label="音量" />
          </label>
          <button class="icon-button" type="button" data-action="mute"></button>
        </div>

        <div class="panel-actions" aria-label="内容面板">
          <button class="icon-button" type="button" data-panel="lyrics"></button>
          <button class="icon-button" type="button" data-panel="queue"></button>
        </div>

        <section class="detail-panel" hidden>
          <div class="panel-heading">
            <h3></h3>
            <button class="icon-button compact-control" type="button" data-action="close-panel"></button>
          </div>
          <div class="queue-toolbar" hidden>
            <input class="queue-search" type="search" placeholder="搜索歌曲、歌手或专辑" aria-label="搜索播放队列" />
            <button class="icon-button compact-control" type="button" data-action="import-playlist"></button>
            <input class="playlist-file-input" type="file" accept="application/json,.json" hidden />
          </div>
          <div class="lyric-toolbar" hidden aria-label="歌词时间校准">
            <button class="icon-button compact-control" type="button" data-action="lyric-earlier"></button>
            <button class="lyric-offset" type="button" data-action="lyric-reset">偏移 0.0 秒</button>
            <button class="icon-button compact-control" type="button" data-action="lyric-later"></button>
          </div>
          <p class="queue-feedback" role="status" aria-live="polite" hidden></p>
          <div class="lyric-list"></div>
          <div class="queue-list" aria-label="歌曲列表"></div>
        </section>

        <button
          class="now-playing-rail"
          type="button"
          data-panel="lyrics"
          aria-label="显示当前歌词"
          aria-expanded="false"
        >
          <span class="rail-icon" aria-hidden="true"></span>
          <span class="now-playing-copy">
            <span class="now-playing-label">NOW PLAYING</span>
            <span class="now-playing-text"></span>
          </span>
          <canvas class="rail-waveform" width="116" height="28" aria-hidden="true"></canvas>
        </button>
      </section>
    `

    this.title = this.get('.track-title')
    this.artist = this.get('.track-artist')
    this.status = this.get('.playback-status')
    this.errorBanner = this.get('.error-banner')
    this.errorMessage = this.get('.error-message')
    this.retryButton = this.get('[data-action="retry"]')
    this.skipButton = this.get('[data-action="skip-failed"]')
    this.currentTime = this.get('.current-time')
    this.duration = this.get('.duration')
    this.playButton = this.get('[data-action="toggle"]')
    this.modeButton = this.get('[data-action="mode"]')
    this.muteButton = this.get('[data-action="mute"]')
    this.volumeInput = this.get('[data-action="volume"]')
    this.lyricButton = this.get('[data-panel="lyrics"]:not(.now-playing-rail)')
    this.queueButton = this.get('[data-panel="queue"]')
    this.panel = this.get('.detail-panel')
    this.panelTitle = this.get('.panel-heading h3')
    this.lyricContainer = this.get('.lyric-list')
    this.queueContainer = this.get('.queue-list')
    this.queueToolbar = this.get('.queue-toolbar')
    this.lyricToolbar = this.get('.lyric-toolbar')
    this.lyricOffset = this.get('.lyric-offset')
    this.queueSearch = this.get('.queue-search')
    this.queueFeedback = this.get('.queue-feedback')
    this.playlistFileInput = this.get('.playlist-file-input')
    this.waveformControl = this.get('.waveform-control')

    const waveformCanvas = this.get<HTMLCanvasElement>('.waveform')
    const railButton = this.get<HTMLButtonElement>('.now-playing-rail')
    const railCanvas = this.get<HTMLCanvasElement>('.rail-waveform')
    const railIcon = this.get<HTMLElement>('.rail-icon')
    railIcon.append(createPlayerIcon('audio-lines', 18))

    this.waveform = new WaveformRenderer(waveformCanvas)
    this.nowPlayingRail = new NowPlayingRail(railButton, railCanvas)
    this.analysisSource = new AudioAnalysisSource(engine)
    this.lyricView = new LyricView(this.lyricContainer, (seconds) => controller.seek(seconds))

    setButtonIcon(this.get('[data-action="previous"]'), 'skip-back', '上一首')
    setButtonIcon(this.get('[data-action="next"]'), 'skip-forward', '下一首')
    setButtonIcon(this.lyricButton, 'captions', '歌词')
    setButtonIcon(this.queueButton, 'list-music', '播放队列')
    setButtonIcon(this.get('[data-action="close-panel"]'), 'close', '收起面板')
    setButtonIcon(this.get('[data-action="import-playlist"]'), 'list-plus', '导入 JSON 歌单并添加到队列')
    setButtonIcon(this.retryButton, 'refresh', '立即重试当前歌曲')
    setButtonIcon(this.skipButton, 'skip-forward', '跳过无法播放的歌曲')
    setButtonIcon(this.get('[data-action="lyric-earlier"]'), 'minus', '歌词提前 0.5 秒')
    setButtonIcon(this.get('[data-action="lyric-later"]'), 'plus', '歌词延后 0.5 秒')

    this.bindEvents()
    this.unsubscribeAnalysis = this.analysisSource.subscribe((frame) => {
      this.waveform.update(frame)
      this.nowPlayingRail.update(frame)
    })
    this.unsubscribe = store.subscribe((state) => this.render(state))
    this.render(store.getState())
  }

  destroy(): void {
    this.eventController.abort()
    this.unsubscribe()
    this.unsubscribeAnalysis()
    this.analysisSource.destroy()
    this.waveform.destroy()
    this.nowPlayingRail.destroy()
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action
      if (action === 'previous') void this.controller.previous()
      if (action === 'toggle') void this.controller.toggle()
      if (action === 'next') void this.controller.next()
      if (action === 'mode') this.controller.cyclePlayMode()
      if (action === 'mute') this.controller.toggleMuted()
      if (action === 'import-playlist') this.playlistFileInput.click()
      if (action === 'retry') void this.controller.retry()
      if (action === 'skip-failed') void this.controller.skipFailed()
      if (action === 'lyric-earlier') this.controller.setLyricOffset(this.store.getState().lyricOffsetMs - 500)
      if (action === 'lyric-later') this.controller.setLyricOffset(this.store.getState().lyricOffsetMs + 500)
      if (action === 'lyric-reset') this.controller.setLyricOffset(0)
      const songIndex = Number(target.closest<HTMLButtonElement>('[data-song-index]')?.dataset.songIndex)
      if (Number.isInteger(songIndex)) {
        if (action === 'select-song') void this.controller.select(songIndex)
        if (action === 'remove-song') void this.controller.removeSong(songIndex)
        if (action === 'move-song-up') this.controller.moveSong(songIndex, songIndex - 1)
        if (action === 'move-song-down') this.controller.moveSong(songIndex, songIndex + 1)
      }
      if (action === 'close-panel') {
        const panel = this.store.getState().panel
        if (panel) this.controller.togglePanel(panel)
      }

      const panel = target.closest<HTMLButtonElement>('[data-panel]')?.dataset.panel
      if (panel === 'lyrics' || panel === 'queue') this.controller.togglePanel(panel)

    }, { signal: this.eventController.signal })

    this.queueSearch.addEventListener('input', () => {
      this.queueQuery = this.queueSearch.value.trim().toLocaleLowerCase()
      this.renderQueue(this.store.getState())
    }, { signal: this.eventController.signal })

    this.playlistFileInput.addEventListener('change', () => {
      const file = this.playlistFileInput.files?.[0]
      this.playlistFileInput.value = ''
      if (!file) return
      void this.controller.loadPlaylist(new FilePlaylistProvider(file), 'append').catch(() => undefined)
    }, { signal: this.eventController.signal })

    this.queueContainer.addEventListener('dragstart', (event) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-queue-index]') : null
      this.draggedSongIndex = Number(item?.dataset.queueIndex ?? -1)
      item?.classList.add('is-dragging')
      event.dataTransfer?.setData('text/plain', String(this.draggedSongIndex))
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    }, { signal: this.eventController.signal })
    this.queueContainer.addEventListener('dragover', (event) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-queue-index]') : null
      if (!item) return
      event.preventDefault()
      this.queueContainer.querySelectorAll('.is-drop-target').forEach((element) => element.classList.remove('is-drop-target'))
      item.classList.add('is-drop-target')
    }, { signal: this.eventController.signal })
    this.queueContainer.addEventListener('drop', (event) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-queue-index]') : null
      const targetIndex = Number(item?.dataset.queueIndex ?? -1)
      event.preventDefault()
      if (this.draggedSongIndex >= 0 && targetIndex >= 0) this.controller.moveSong(this.draggedSongIndex, targetIndex)
      this.resetQueueDragState()
    }, { signal: this.eventController.signal })
    this.queueContainer.addEventListener('dragend', () => this.resetQueueDragState(), { signal: this.eventController.signal })

    const updateVolume = (): void => {
      this.controller.setVolume(Number(this.volumeInput.value))
    }
    this.volumeInput.addEventListener('input', updateVolume, { signal: this.eventController.signal })
    this.volumeInput.addEventListener('change', updateVolume, { signal: this.eventController.signal })

    const ratioFromPointer = (event: PointerEvent): number => {
      const rect = this.waveformControl.getBoundingClientRect()
      return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    }
    const previewPointer = (event: PointerEvent): number => {
      const ratio = ratioFromPointer(event)
      if (this.draggingWaveform) {
        this.waveformPreviewRatio = ratio
        this.waveform.setProgressPreview(ratio)
        this.renderSeekPosition(ratio)
      } else {
        this.waveform.setPointerRatio(ratio)
      }
      return ratio
    }

    this.waveformControl.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.draggingWaveform = true
      this.waveformControl.setPointerCapture(event.pointerId)
      // Safari starts a new media range request for many currentTime writes.
      // Keep drag movement visual and commit exactly once on pointerup.
      previewPointer(event)
    }, { signal: this.eventController.signal })
    this.waveformControl.addEventListener('pointermove', (event) => {
      previewPointer(event)
    }, { signal: this.eventController.signal })
    this.waveformControl.addEventListener('pointerup', (event) => {
      if (!this.draggingWaveform) return
      const ratio = previewPointer(event)
      this.draggingWaveform = false
      if (this.waveformControl.hasPointerCapture(event.pointerId)) this.waveformControl.releasePointerCapture(event.pointerId)
      this.controller.seekRatio(ratio)
      this.waveformPreviewRatio = null
      this.waveform.setProgressPreview(null)
    }, { signal: this.eventController.signal })
    this.waveformControl.addEventListener('pointercancel', () => {
      this.draggingWaveform = false
      this.waveformPreviewRatio = null
      this.waveform.setProgressPreview(null)
      this.waveform.setPointerRatio(null)
      this.renderSeekPosition(null)
    }, { signal: this.eventController.signal })
    this.waveformControl.addEventListener('pointerleave', () => {
      if (!this.draggingWaveform) this.waveform.setPointerRatio(null)
    }, { signal: this.eventController.signal })
    this.waveformControl.addEventListener('keydown', (event) => {
      const state = this.store.getState()
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        this.controller.seek(state.currentTime + (event.key === 'ArrowRight' ? 5 : -5))
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        event.stopPropagation()
        this.controller.seek(event.key === 'Home' ? 0 : state.duration)
      }
    }, { signal: this.eventController.signal })
  }

  private render(state: PlayerState): void {
    const song = state.playlist[state.currentIndex]
    this.title.textContent = song?.title ?? '等待添加歌曲'
    this.artist.textContent = [song?.artist, song?.album].filter(Boolean).join(' · ') || '未知艺术家'
    this.status.textContent = !song
      ? '队列为空'
      : state.error
      ? '播放出错'
      : state.isLoading
        ? '载入中'
        : state.isPlaying
          ? '正在播放'
          : '已暂停'
    this.status.classList.toggle('is-error', Boolean(song && state.error))
    this.status.title = state.error ?? ''
    this.errorBanner.hidden = !state.error
    this.errorMessage.textContent = state.recoveryMessage ?? state.error ?? ''
    this.retryButton.hidden = !state.canRetry
    this.skipButton.hidden = !state.canSkip
    const duration = state.duration || song?.duration || 0
    const displayTime = this.waveformPreviewRatio === null ? state.currentTime : this.waveformPreviewRatio * duration
    this.currentTime.textContent = formatTime(displayTime)
    this.duration.textContent = formatTime(duration)

    if (this.lastPlaying !== state.isPlaying) {
      setButtonIcon(this.playButton, state.isPlaying ? 'pause' : 'play', state.isPlaying ? '暂停' : '播放')
      this.playButton.setAttribute('aria-pressed', String(state.isPlaying))
      this.lastPlaying = state.isPlaying
    }
    if (this.lastMode !== state.playMode) {
      const mode = MODE_CONTROL[state.playMode]
      setButtonIcon(this.modeButton, mode.icon, mode.label)
      this.modeButton.setAttribute('aria-label', `${mode.label}，点击切换播放模式`)
      this.lastMode = state.playMode
    }
    if (this.lastMuted !== state.muted) {
      setButtonIcon(this.muteButton, state.muted ? 'volume-muted' : 'volume', state.muted ? '取消静音' : '静音')
      this.muteButton.setAttribute('aria-pressed', String(state.muted))
      this.lastMuted = state.muted
    }

    this.volumeInput.value = String(state.volume)
    this.volumeInput.style.setProperty('--range-progress', `${state.volume * 100}%`)
    this.volumeInput.setAttribute('aria-valuetext', `${state.muted ? '已静音，' : ''}音量 ${Math.round(state.volume * 100)}%`)

    const progress = duration > 0 ? displayTime / duration : 0
    this.waveformControl.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
    this.waveformControl.setAttribute('aria-valuetext', `${formatTime(displayTime)} / ${formatTime(duration)}`)

    if (state.isPlaying) this.analysisSource.start()
    else this.analysisSource.stop()
    this.analysisSource.refresh()

    this.renderPanel(state)
    this.lyricView.setLines(state.lyrics, song)
    this.lyricView.setActive(state.activeLyricIndex)
    this.lyricView.setTime(state.currentTime * 1000 + state.lyricOffsetMs)
    this.nowPlayingRail.setState(state)
    this.lyricButton.classList.toggle('is-active', state.panel === 'lyrics')
    this.lyricButton.setAttribute('aria-pressed', String(state.panel === 'lyrics'))
    this.queueButton.classList.toggle('is-active', state.panel === 'queue')
    this.queueButton.setAttribute('aria-pressed', String(state.panel === 'queue'))

    if (this.lastPlaylist !== state.playlist || this.lastIndex !== state.currentIndex || this.lastPanel !== state.panel) {
      this.renderQueue(state)
      this.lastPlaylist = state.playlist
      this.lastIndex = state.currentIndex
    }
    this.lastPanel = state.panel
  }

  private renderPanel(state: PlayerState): void {
    this.panel.hidden = state.panel === null
    this.panelTitle.textContent = state.panel === 'lyrics' ? '同步歌词' : '播放队列'
    this.lyricContainer.hidden = state.panel !== 'lyrics'
    this.queueContainer.hidden = state.panel !== 'queue'
    this.queueToolbar.hidden = state.panel !== 'queue'
    this.lyricToolbar.hidden = state.panel !== 'lyrics'
    this.lyricOffset.textContent = `偏移 ${(state.lyricOffsetMs / 1000).toFixed(1)} 秒`
    this.queueFeedback.hidden = state.panel !== 'queue' || (!state.playlistMessage && !state.isPlaylistLoading)
    this.queueFeedback.textContent = state.isPlaylistLoading ? '正在读取歌单…' : state.playlistMessage ?? ''
  }

  private renderQueue(state: PlayerState): void {
    this.queueContainer.replaceChildren()
    const matches = state.playlist
      .map((song, index) => ({ song, index }))
      .filter(({ song }) => !this.queueQuery || [song.title, song.artist, song.album]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(this.queueQuery)))

    if (!matches.length) {
      const empty = document.createElement('p')
      empty.className = 'empty-state'
      empty.textContent = state.playlist.length ? '没有匹配的歌曲' : '队列为空，可导入 JSON 歌单'
      this.queueContainer.append(empty)
      return
    }

    matches.forEach(({ song, index }) => {
      const item = document.createElement('div')
      item.className = 'queue-item'
      item.dataset.queueIndex = String(index)
      item.draggable = true
      item.classList.toggle('is-current', index === state.currentIndex)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'queue-select'
      button.dataset.action = 'select-song'
      button.dataset.songIndex = String(index)
      button.setAttribute('aria-current', index === state.currentIndex ? 'true' : 'false')
      button.setAttribute('aria-label', `${index === state.currentIndex ? '当前播放，' : ''}播放 ${song.title}`)

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

      const actions = document.createElement('div')
      actions.className = 'queue-item-actions'
      actions.append(
        this.createQueueAction('move-song-up', 'chevron-up', `上移 ${song.title}`, index, index === 0),
        this.createQueueAction('move-song-down', 'chevron-down', `下移 ${song.title}`, index, index === state.playlist.length - 1),
        this.createQueueAction('remove-song', 'trash', `从队列移除 ${song.title}`, index),
      )
      item.append(button, actions)
      this.queueContainer.append(item)
    })

    if (state.panel === 'queue' && !this.queueQuery) {
      requestAnimationFrame(() => {
        this.queueContainer.querySelector('.queue-item.is-current')?.scrollIntoView({ block: 'nearest' })
      })
    }
  }

  private createQueueAction(
    action: string,
    icon: PlayerIcon,
    label: string,
    songIndex: number,
    disabled = false,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'queue-action'
    button.dataset.action = action
    button.dataset.songIndex = String(songIndex)
    button.disabled = disabled
    setButtonIcon(button, icon, label)
    return button
  }

  private resetQueueDragState(): void {
    this.draggedSongIndex = -1
    this.queueContainer.querySelectorAll('.is-dragging, .is-drop-target').forEach((element) => {
      element.classList.remove('is-dragging', 'is-drop-target')
    })
  }

  private renderSeekPosition(ratio: number | null): void {
    const state = this.store.getState()
    const song = state.playlist[state.currentIndex]
    const duration = state.duration || song?.duration || 0
    const time = ratio === null ? state.currentTime : ratio * duration
    const progress = duration > 0 ? time / duration : 0
    this.currentTime.textContent = formatTime(time)
    this.waveformControl.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
    this.waveformControl.setAttribute('aria-valuetext', `${formatTime(time)} / ${formatTime(duration)}`)
  }

  private get<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (!element) throw new Error(`Missing player element: ${selector}`)
    return element
  }
}
