# Arcueid Music Player

一个基于原生 Web Components、TypeScript、HTMLMediaElement 和 Web Audio 的博客音乐播放器。前台默认是只读播放组件，支持公开音乐 API、同步歌词、波形进度、Media Session、播放记忆以及可收缩、拖拽、侧边吸附的浮动窗口。

配置 `music-api` 后，播放队列面板提供两级浏览：默认直接显示默认歌单歌曲，返回后可以选择其他公开歌单。浏览不会打断当前音乐，只有点击歌曲才会切换实际播放队列。

## 开发

```bash
npm install
npm run dev
npm test
npm run build
```

## 博客快速接入

```html
<arcueid-music-player
  music-api="/api/music"
  playlist-id="default"
  playlist-mode="readonly"
  play-mode="order"
  theme="system"
  remember-playback
  remember-position
  dock-side="auto"
></arcueid-music-player>
```

`music-api` 对应 Spring Boot 公开只读接口：

```text
GET /api/music/playlists
GET /api/music/playlists/:id
```

`playlist-mode="readonly"` 不显示 JSON 导入、删除或永久排序入口。宿主仍可以通过 `playlist`、`playlist-src`、`PublicMusicApiProvider` 或 `createMusicPlayer()` 配置内容；后台写接口与权限不属于本播放器。

直接歌曲 JSON 仍可使用：

```html
<arcueid-music-player
  playlist-src="/api/music/current-playlist"
  playlist-mode="readonly"
></arcueid-music-player>
```

## 程序化挂载

```ts
import { createMusicPlayer } from 'arcueid-music-player'

const instance = createMusicPlayer({
  target: document.querySelector('#music-player')!,
  musicApi: '/api/music',
  playlistId: 'default',
  playlistMode: 'readonly',
  rememberPlayback: true,
  rememberPosition: true,
  dockSide: 'auto',
})

// 宿主卸载时调用
instance.destroy()
```

## 关键文档

- [项目架构](./docs/ARCHITECTURE.md)
- [博客接入与完整接口](./docs/BLOG-INTEGRATION-API.md)
- [浏览器兼容与媒体服务器要求](./docs/BROWSER-COMPATIBILITY.md)

项目只保留这三份核心文档。历史阶段审核、早期规划和迁移记录已经合并到上述文档或 Git 历史中。
