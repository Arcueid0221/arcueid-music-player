import {
  AudioLines,
  Captions,
  createElement,
  ListMusic,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  type IconNode,
} from 'lucide'

export type PlayerIcon =
  | 'audio-lines'
  | 'captions'
  | 'close'
  | 'list-music'
  | 'pause'
  | 'play'
  | 'repeat'
  | 'repeat-one'
  | 'shuffle'
  | 'skip-back'
  | 'skip-forward'
  | 'volume'
  | 'volume-muted'

const ICONS: Record<PlayerIcon, IconNode> = {
  'audio-lines': AudioLines,
  captions: Captions,
  close: X,
  'list-music': ListMusic,
  pause: Pause,
  play: Play,
  repeat: Repeat2,
  'repeat-one': Repeat1,
  shuffle: Shuffle,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  volume: Volume2,
  'volume-muted': VolumeX,
}

export function createPlayerIcon(icon: PlayerIcon, size = 20): SVGElement {
  return createElement(ICONS[icon], {
    class: 'control-icon',
    width: size,
    height: size,
    'aria-hidden': 'true',
  })
}

export function setButtonIcon(button: HTMLButtonElement, icon: PlayerIcon, label: string): void {
  const svg = createPlayerIcon(icon)
  button.replaceChildren(svg)
  button.setAttribute('aria-label', label)
  button.title = label
}
