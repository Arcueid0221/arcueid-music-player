import {
  AudioLines,
  Captions,
  ChevronDown,
  ChevronUp,
  createElement,
  GripVertical,
  ListPlus,
  ListMusic,
  Minus,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
  type IconNode,
} from 'lucide'

export type PlayerIcon =
  | 'audio-lines'
  | 'captions'
  | 'chevron-down'
  | 'chevron-up'
  | 'close'
  | 'drag'
  | 'list-music'
  | 'list-plus'
  | 'minus'
  | 'maximize'
  | 'minimize'
  | 'pause'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'repeat'
  | 'repeat-one'
  | 'shuffle'
  | 'skip-back'
  | 'skip-forward'
  | 'trash'
  | 'volume'
  | 'volume-muted'

const ICONS: Record<PlayerIcon, IconNode> = {
  'audio-lines': AudioLines,
  captions: Captions,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  close: X,
  drag: GripVertical,
  'list-music': ListMusic,
  'list-plus': ListPlus,
  minus: Minus,
  maximize: Maximize2,
  minimize: Minimize2,
  pause: Pause,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  repeat: Repeat2,
  'repeat-one': Repeat1,
  shuffle: Shuffle,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  trash: Trash2,
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
