# Arcueid Music Player

一个基于原生 Web Components、TypeScript 与 HTML5 Audio 的轻量音乐播放器。项目从 `xf-music-player` 的实验代码重构而来，保留本地歌单、播放控制、播放模式、同步歌词和实时波形，同时把业务编排从 UI 中拆开。

## 开发

```bash
npm install
npm run dev
npm test
npm run build
```

```html
<arcueid-music-player
  play-mode="order"
  volume="0.8"
  remember-playback
></arcueid-music-player>
```

```ts
import type { Song } from 'arcueid-music-player'

const player = document.querySelector('arcueid-music-player')!
player.playlist = [
  {
    id: 'demo',
    title: 'Demo Song',
    artist: 'Artist',
    src: '/audio/demo.mp3',
    lyricsUrl: '/lrc/demo.lrc',
  },
] satisfies Song[]
```

公开方法包括 `play`、`pause`、`toggle`、`next`、`previous`、`select`、`seek`、`setVolume`、`mute`、`setPlayMode` 与 `getState`。

## 分层

- `domain/`：稳定的数据类型与纯播放队列算法。
- `core/`：音频引擎、状态仓库和播放器编排。
- `services/`：歌词加载/解析与播放记忆。
- `ui/`：只负责 DOM、样式、歌词列表和 Canvas 波形。
- `player-element.ts`：薄薄的一层 Web Component 适配器与公开 API。

完整的分层、拆分映射和功能增减说明见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)，后续扩展原则和阶段计划见 [docs/ROADMAP.md](./docs/ROADMAP.md)。
