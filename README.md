# Arcueid Music Player

一个基于原生 Web Components、TypeScript、HTMLMediaElement 和 Web Audio 的博客音乐播放器。前台默认是只读播放组件，支持本地 JSON 多歌单、公开音乐 API、同步歌词、波形进度、Media Session、播放记忆以及可收缩、拖拽、侧边吸附的浮动窗口。

配置 `playlist-config` 或 `music-api` 后，播放队列面板提供两级浏览：默认直接显示默认歌单歌曲，返回后可以选择其他歌单。浏览不会打断当前音乐，只有点击歌曲才会切换实际播放队列。

## 开发

```bash
npm install
npm run dev
npm test
npm run build
```

## 博客快速接入

播放器支持三种互斥的外部歌单源：

| 属性 | 适用场景 | JSON/API 形态 | 多歌单 |
| --- | --- | --- | --- |
| `playlist-config` | 静态站点、CDN、对象存储 | `{ defaultPlaylistId, playlists }` | 是 |
| `playlist-src` | 一个直接歌曲列表 | `Song[]`、`{ songs }` 或 `{ playlist }` | 否 |
| `music-api` | Aurora/Spring Boot 动态数据 | `/playlists` 与 `/playlists/:id` | 是 |

三者同时出现时按 `playlist-config > playlist-src > music-api` 选择，并且加载失败不会回退到下一来源。完整字段、模式差异和响应格式见[博客接入与完整接口](./docs/BLOG-INTEGRATION-API.md#36-三种歌单源与参数详解)。

不需要后端的静态 JSON 模式：

```html
<arcueid-music-player
  playlist-config="/music/playlists.json"
  playlist-mode="readonly"
></arcueid-music-player>
```

`playlists.json` 包含 `defaultPlaylistId` 和 `playlists`；每个歌单可配置 `cover`、`description` 和 `songs`。音频、歌词与封面相对地址都以配置文件地址为基准。

使用 Aurora/Spring Boot Public Music API：

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

`playlist-mode="readonly"` 不显示 JSON 导入、删除或永久排序入口。宿主仍可以通过 `playlist`、`playlist-src`、`playlist-config`、Provider 或 `createMusicPlayer()` 配置内容；后台写接口与权限不属于本播放器。

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
  playlistConfig: '/music/playlists.json',
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
