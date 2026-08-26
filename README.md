# Arcueid Music Player

一个基于原生 Web Components、TypeScript 与 HTML5 Audio 的轻量音乐播放器。项目从 `xf-music-player` 的实验代码重构而来，保留本地歌单、播放控制、播放模式和同步歌词，并增加波形进度轨、当前歌词底边栏、图标控制与跨浏览器音量条，同时把业务编排从 UI 中拆开。

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
  theme="system"
  remember-playback
  playlist-src="/api/playlist.json"
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

也可以使用可替换的数据源：

```ts
import {
  ArrayPlaylistProvider,
  FilePlaylistProvider,
  JsonPlaylistProvider,
} from 'arcueid-music-player'

await player.loadPlaylist(new JsonPlaylistProvider('/api/playlist.json'))
await player.loadPlaylist(new ArrayPlaylistProvider(moreSongs), 'append')
await player.loadPlaylist(new FilePlaylistProvider(file), 'append')
```

公开方法包括 `play`、`pause`、`stop`、`toggle`、`next`、`previous`、`select`、`seek`、`seekBy`、`setVolume`、`mute`、`setPlayMode`、`loadPlaylist`、`usePlaylist`、`addSongs`、`removeSong`、`moveSong` 与 `getState`。

此外支持 `setTheme`、`setLyricOffset`、`retry` 和 `skipFailed`，并派发 `ready`、`trackchange`、`playbackchange` 与 `error` 事件。需要程序化挂载或多实例时使用 `createMusicPlayer()`；最小示例见 [examples/minimal.html](./examples/minimal.html)。SSR 应在客户端生命周期内动态导入本包。

## 分层

- `domain/`：稳定的数据类型与纯播放队列算法。
- `core/`：音频引擎、状态仓库和播放器编排。
- `services/`：歌词、播放记忆、后台恢复、Media Session 与 PlaylistProvider 外部数据适配。
- `ui/`：只负责 DOM、样式、歌词列表、图标控制和 Canvas 波形。
- `player-element.ts`：薄薄的一层 Web Component 适配器与公开 API。

完整的分层、拆分映射和功能增减说明见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)，后续扩展原则和阶段计划见 [docs/ROADMAP.md](./docs/ROADMAP.md)。

发布与升级说明见 [浏览器兼容策略](./docs/BROWSER-COMPATIBILITY.md) 和 [版本迁移说明](./docs/MIGRATION.md)。本轮功能验收与截图证据见 [最终浏览器审核](./docs/FINAL-BROWSER-AUDIT.md)；开发环境还可以打开 `/browser-audit.html` 复现深色主题、故障恢复与逐字歌词场景。
