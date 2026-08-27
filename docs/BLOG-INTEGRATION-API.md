# 博客接入与接口说明

本文面向负责 Vue 3 博客前台与 Spring Boot 音乐接口的开发者，描述 `arcueid-music-player` 当前已经实现的接入契约。播放器是原生 Web Component；博客后台的歌曲、歌单与资源管理不属于本仓库。

## 1. 当前边界

```text
Vue 2 Blog Admin ──认证写接口──> Spring Boot /api/admin/music/**
                                      │
                                      └──公开只读接口──> Vue 3 Blog
                                                              │
                                                              ▼
                                                  <arcueid-music-player>
```

- Spring Boot 负责数据库、权限、公开歌单和媒体资源地址。
- Vue 2 后台负责新增、编辑、删除、导入和永久排序。
- Vue 3 前台只配置播放器、读取公开歌单并播放。
- 播放器不会调用管理写接口，也不会把访客的本地播放顺序写回服务器。
- `playlist-mode="readonly"` 禁用访客界面的导入、删除和排序，但它不是后端权限措施。

## 2. 构建与产物

```bash
npm install
npm test
npm run build
```

主要构建产物：

```text
dist/arcueid-music-player.js      ESM
dist/arcueid-music-player.min.js  IIFE
dist/arcueid-music-player.d.ts    TypeScript 导出类型
dist/*.map                        Source map
```

Vite 配置了 `copyPublicDir: false`，仓库的演示音频与歌词不会复制到 `dist`；博客必须提供自己的媒体资源。

ESM 导入会自动注册 `<arcueid-music-player>`：

```ts
import 'arcueid-music-player'
```

当前 `package.json` 标记为 `private`，尚未发布到 npm。包名导入适用于把本仓库配置为 workspace/file 依赖或之后发布私有包的场景；当前博客也可以直接复制构建产物并按 URL 导入：

如果直接使用本仓库构建产物：

```ts
import '/assets/music-player/arcueid-music-player.js'
```

## 3. Vue 3 接入

### 3.1 声明自定义元素

Vite + Vue 3 应在 Vue 编译配置中把标签识别为原生自定义元素：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === 'arcueid-music-player',
      },
    },
  })],
})
```

### 3.2 使用 Spring Boot Public Music API

```vue
<script setup lang="ts">
import 'arcueid-music-player'
</script>

<template>
  <arcueid-music-player
    music-api="/api/music"
    playlist-id="default"
    playlist-mode="readonly"
    play-mode="order"
    theme="system"
    remember-playback
    remember-position
    dock-side="auto"
  />
</template>
```

省略 `playlist-id` 时，Provider 会先请求公开歌单列表，选择 `isDefault: true` 的歌单；没有默认项时选择第一个未明确标记为私有的歌单。

在只读 `music-api` 模式下，队列面板采用两级导航：

1. 初次打开直接显示初始或默认歌单的歌曲；
2. 返回后显示所有公开歌单；
3. 选择歌单只浏览其歌曲，不暂停音乐或替换当前播放队列；
4. 点击歌曲时才将该歌单设为实际播放队列，并从所选歌曲开始播放。

歌单详情会在组件实例生命周期内缓存。`playlist-src` 和显式 `editable` 模式继续使用原有单队列界面。

### 3.3 使用现有单一 JSON 接口

如果 Spring Boot 已经提供直接返回歌曲数组的接口，可以继续使用：

```vue
<arcueid-music-player
  playlist-src="/api/music/current-playlist"
  playlist-mode="readonly"
/>
```

`playlist-src` 接受以下结构：

```json
[
  { "id": 1, "title": "Song", "src": "/media/song.mp3" }
]
```

或：

```json
{
  "playlist": [
    { "id": 1, "title": "Song", "src": "/media/song.mp3" }
  ]
}
```

对象键也可以使用 `songs`。

### 3.4 数据源优先级

组件连接或相关属性变化时按以下优先级加载：

1. `playlist-src`：使用 `JsonPlaylistProvider` 直接读取歌曲 JSON；
2. `music-api` + 可选 `playlist-id`：使用 `PublicMusicApiProvider`；
3. 两者都没有：使用通过 `player.playlist`、`createMusicPlayer({ playlist })` 提供的数据；未提供时使用仓库演示歌单。

同时配置 `playlist-src` 和 `music-api` 时，`playlist-src` 绝对优先；它加载失败时不会自动回退到 `music-api`。

## 4. HTML 属性

| 属性 | 值/默认值 | 作用 | 动态变化 |
| --- | --- | --- | --- |
| `music-api` | URL | Public Music API 根地址，例如 `/api/music` | 重新加载歌单 |
| `playlist-id` | string/number | 指定公开歌单；省略时自动发现默认歌单 | 重新加载歌单 |
| `playlist-src` | URL | 直接歌曲 JSON 地址，优先于 `music-api` | 重新加载歌单 |
| `playlist-mode` | `readonly` / `editable`，默认 `readonly` | 控制是否显示导入、删除和排序 UI | 立即更新 UI |
| `play-mode` | `order` / `single` / `random`，默认 `order` | 播放顺序 | 立即生效 |
| `volume` | `0`–`1`，默认 `0.8` | 初始或当前应用内音量 | 立即生效 |
| `theme` | `light` / `dark` / `system`，默认 `system` | 播放器主题 | 立即生效 |
| `remember-playback` | 布尔属性 | 保存歌曲、进度、音量和播放模式 | 初始化时读取 |
| `memory-key` | string | 播放记忆的 localStorage key | 初始化时读取 |
| `expanded` | 布尔属性 | 初始化时打开播放队列面板 | 初始化时读取 |
| `collapsed` | 布尔属性 | 收缩为侧边迷你播放器 | 动态生效 |
| `dock-side` | `auto` / `left` / `right`，默认 `auto` | 自动吸附或强制停靠侧 | 动态生效并重新吸附 |
| `remember-position` | 布尔属性 | 保存位置、收缩状态和停靠侧 | 动态启用/停用保存 |
| `position-key` | string | 浮动位置的 localStorage key | 初始化时读取 |

布尔属性以“是否存在”为准，不要写 `remember-position="false"`；如需关闭，应移除该属性。

## 5. JavaScript 属性与程序化创建

### 5.1 `playlist`

```ts
import type { Song } from 'arcueid-music-player'

const player = document.querySelector('arcueid-music-player')!

player.playlist = [
  {
    id: 'song-1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    src: '/media/song.mp3',
    lyricsUrl: '/media/song.lrc',
  },
] satisfies Song[]
```

读取 `player.playlist` 会得到当前歌曲数组的浅拷贝。

### 5.2 `createMusicPlayer()`

```ts
import { createMusicPlayer } from 'arcueid-music-player'

const instance = createMusicPlayer({
  target: document.querySelector('#music-player')!,
  musicApi: '/api/music',
  playlistId: 'default',
  playlistMode: 'readonly',
  playMode: 'order',
  theme: 'system',
  volume: 0.8,
  collapsed: false,
  dockSide: 'auto',
  rememberPlayback: true,
  memoryKey: 'blog:music:playback',
  rememberPosition: true,
  positionKey: 'blog:music:position',
  onReady: (player) => console.info('ready', player),
  onDestroy: () => console.info('destroyed'),
})

// 卸载宿主页面时释放播放器
instance.destroy()
```

`MusicPlayerInstance` 只包含 `element` 和幂等的 `destroy()`。

## 6. 公开方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `play()` | `Promise<void>` | 播放当前歌曲；可能受浏览器手势策略限制 |
| `pause()` | `void` | 暂停 |
| `stop()` | `void` | 暂停并回到 0 秒 |
| `toggle()` | `Promise<void> \| void` | 切换播放/暂停 |
| `next()` | `Promise<void>` | 下一首 |
| `previous()` | `Promise<void>` | 上一首 |
| `select(index)` | `Promise<void>` | 选择并加载指定索引 |
| `seek(seconds)` | `void` | 跳到绝对秒数 |
| `seekBy(seconds)` | `void` | 按相对秒数跳转 |
| `setVolume(volume)` | `void` | 设置 0–1 音量 |
| `mute()` | `void` | 切换静音 |
| `setPlayMode(mode)` | `void` | 设置播放模式 |
| `setTheme(theme)` | `void` | 设置主题属性 |
| `setLyricOffset(ms)` | `void` | 设置歌词偏移，Controller 限制为 ±30 秒 |
| `retry()` | `Promise<void>` | 重试当前失败歌曲 |
| `skipFailed()` | `Promise<void>` | 跳过失败歌曲 |
| `loadPlaylist(provider, mode?)` | `Promise<number>` | 使用 Provider 替换或追加歌曲，返回加载数量 |
| `usePlaylist(songs, mode?)` | `Promise<number>` | 使用本地 `Song[]` 替换或追加 |
| `addSongs(songs)` | `void` | 宿主向当前本地队列追加歌曲 |
| `removeSong(index)` | `Promise<void>` | 宿主修改本地队列；只读 UI 不暴露此操作 |
| `moveSong(from, to)` | `void` | 宿主修改本地队列顺序；不写回后端 |
| `getState()` | `PlayerState \| undefined` | 获取当前 Store 快照 |
| `collapse()` | `void` | 收缩播放器 |
| `expand()` | `void` | 展开播放器 |
| `toggleCollapsed()` | `void` | 切换收缩状态 |
| `setDockSide(side)` | `void` | 设置 `auto`、`left` 或 `right` 停靠策略 |

`loadPlaylist()` 的 `mode` 为 `replace`（默认）或 `append`。只读模式不会删除这些宿主 API，因为它限制的是访客 UI，不是宿主初始化能力。

## 7. 事件

所有事件都从 `<arcueid-music-player>` 监听：

```ts
const player = document.querySelector('arcueid-music-player')!

player.addEventListener('trackchange', (event) => {
  console.info(event.detail.song, event.detail.index)
})
```

| 事件 | detail | 冒泡 | 说明 |
| --- | --- | --- | --- |
| `ready` | 无 | 否 | 组件内部初始化完成后微任务派发；不表示远程歌单已经加载成功 |
| `trackchange` | `{ song?, previousSong?, index }` | 是 | 当前歌曲 ID 变化 |
| `playbackchange` | `{ isPlaying, isLoading, currentTime, duration }` | 是 | 播放或加载状态变化 |
| `error` | `{ message, song?, canRetry, canSkip }` | 否 | 播放错误；遵循平台 error 事件不冒泡习惯 |
| `collapsechange` | `{ collapsed }` | 是 | 收缩/展开状态变化 |
| `positionchange` | `{ x, y, dockSide }` | 是 | 拖拽结束、键盘停靠或视口变化后的位置 |

事件均设置 `composed: true`，可以穿过 Shadow DOM 边界。

## 8. 数据模型

### 8.1 播放器 `Song`

```ts
interface Song {
  id: string | number
  title: string
  artist?: string
  album?: string
  src: string
  duration?: number
  artwork?: MediaImage[]
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  lyrics?: string | LyricLine[]
  lyricsUrl?: string
}
```

### 8.2 Spring Boot `Track`

```ts
interface Track {
  id: string | number
  title: string
  artist?: string
  album?: string
  cover?: string
  audioUrl: string
  lyricUrl?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  duration?: number
}
```

`PublicMusicApiProvider` 映射规则：

| Track | Song |
| --- | --- |
| `audioUrl` | `src` |
| `lyricUrl` | `lyricsUrl` |
| `cover` | `artwork[0].src` |
| `crossOrigin` | `crossOrigin` |
| 其他同名字段 | 原样映射 |

为了兼容现有接口，Provider 也接受 `src` 和 `lyricsUrl`，但新的 Spring Boot 公共契约建议统一使用 `audioUrl`、`lyricUrl`。

### 8.3 `Playlist` 与 `PlaylistTrack`

```ts
interface PlaylistSummary {
  id: string | number
  name: string
  description?: string
  cover?: string
  trackCount?: number
  isPublic?: boolean
  isDefault?: boolean
}

interface Playlist extends PlaylistSummary {
  tracks: Array<Track | PlaylistTrack>
}

interface PlaylistTrack {
  playlistId?: string | number
  trackId: string | number
  order: number
  track?: Track
}

interface PublicMusicApiEnvelope<T> {
  data: T
  code?: string | number
  message?: string
}
```

后端数据库应使用 `PlaylistTrack` 维护关联与顺序，不必把完整 Track JSON 复制到歌单表。公开详情接口可以返回已经展开的 `track`，减少浏览器请求数量。
`PlaylistTrack.track` 在类型上可选，但当前播放器要直接播放关联项，因此详情响应中的关联形式必须展开 `track`。
Provider 不读取 `PlaylistTrack.order` 后再排序；Spring Boot 必须按最终播放顺序返回数组。

## 9. Spring Boot Public Music API 契约

### 9.1 指定歌单

```http
GET /api/music/playlists/{id}
```

支持直接对象或 `{ "data": ... }` 包装。推荐响应：

```json
{
  "data": {
    "id": "default",
    "name": "默认歌单",
    "isPublic": true,
    "isDefault": true,
    "tracks": [
      {
        "id": "song-1",
        "title": "Song",
        "artist": "Artist",
        "album": "Album",
        "cover": "/media/covers/song-1.jpg",
        "audioUrl": "/media/audio/song-1.mp3",
        "lyricUrl": "/media/lyrics/song-1.lrc",
        "crossOrigin": "anonymous",
        "duration": 240
      }
    ]
  }
}
```

也支持关联展开形式：

```json
{
  "data": {
    "id": "default",
    "tracks": [
      {
        "playlistId": "default",
        "trackId": "song-1",
        "order": 1,
        "track": {
          "id": "song-1",
          "title": "Song",
          "audioUrl": "/media/audio/song-1.mp3"
        }
      }
    ]
  }
}
```

详情数组键可以是 `tracks`、`playlistTracks` 或兼容键 `songs`。

### 9.2 自动发现默认歌单

```http
GET /api/music/playlists
```

推荐响应：

```json
{
  "data": [
    {
      "id": "default",
      "name": "默认歌单",
      "isPublic": true,
      "isDefault": true
    }
  ]
}
```

也接受 `{ "data": { "playlists": [...] } }`。播放器过滤 `isPublic: false`，优先选择 `isDefault: true`，否则选择第一项，然后请求详情接口。

兼容情况下，`GET /playlists` 若直接返回一个含 `tracks`、`playlistTracks` 或 `songs` 的详情对象，Provider 会直接解析，不再发起第二个请求。

播放器只调用上述歌单列表与详情 GET 接口，不会额外调用 `/tracks/{id}`，也不会调用任何新增、修改、删除或排序接口。

### 9.3 程序化 Provider

```ts
import { PublicMusicApiProvider } from 'arcueid-music-player'

const provider = new PublicMusicApiProvider('/api/music', {
  playlistId: 'default',
  // 测试、鉴权代理或自定义传输时可以注入 fetcher
  fetcher: window.fetch.bind(window),
})

await player.loadPlaylist(provider)
```

### 9.4 错误约定

- 非 2xx 响应会转成包含 HTTP 状态码的歌单加载错误。
- 列表没有公开歌单时提示“公开音乐 API 没有可播放歌单”。
- 详情缺少 `tracks` 数组时拒绝载入。
- 单曲缺少 `title` 或 `audioUrl` 时指出歌曲序号。
- Provider 错误由 Controller 写入 `playlistMessage`；不会破坏已经加载的 AudioEngine、歌词或 Media Session 服务。
- `AbortSignal` 会传给 fetch，后发起的歌单请求可以取消旧请求。
- 通过 `music-api` / `playlist-src` 属性触发的加载失败不会派发媒体 `error` 事件；需要程序化确认结果时，应使用并捕获 `loadPlaylist(provider)` 返回的 Promise。

## 10. 浮动播放器

### 10.1 基本行为

- 展开状态使用完整播放器卡片。
- 点击“收缩播放器”后显示 128 × 54 像素迷你控制条，保留移动、播放/暂停和展开按钮。
- 完整与迷你状态均有独立拖拽手柄，不占用波形、音量或歌词的手势区域。
- 松开指针后吸附到最近侧；`dock-side="left|right"` 可以强制一侧。
- 使用方向键可调整垂直位置，`Home`/`End` 分别停靠左侧/右侧。
- 位置会限制在视口和 `safe-area-inset-*` 内。

### 10.2 位置记忆

```html
<arcueid-music-player
  remember-position
  position-key="blog:music:position"
></arcueid-music-player>
```

保存内容包括：

```ts
{
  x: number
  y: number
  dockSide: 'left' | 'right'
  collapsed: boolean
}
```

localStorage 不可用时自动降级，不阻塞播放。多个 HTML 元素若不指定 key，会共享默认存储状态，因此多实例应设置独立的 `memory-key` 和 `position-key`；`createMusicPlayer()` 在启用相应记忆且未显式提供 key 时会生成实例 key。

## 11. 媒体服务器要求

音频跳转尤其是 Safari/iOS Safari 依赖正确的 Range 响应：

```http
Accept-Ranges: bytes
Content-Length: ...
Content-Type: audio/mpeg
```

Range 请求应返回：

```http
206 Partial Content
Content-Range: bytes start-end/total
```

跨域资源要求：

- 音频、歌词和封面服务器允许博客 Origin；
- 需要 Web Audio 波形且音频跨域时，Track/Song 应设置 `crossOrigin: "anonymous"`，音频响应同时提供匹配的 `Access-Control-Allow-Origin`；同源或经博客反向代理通常更简单；
- Spring Boot 应允许公开 GET/HEAD/Range 请求，但不要把 `/api/admin/music/**` 暴露为匿名写接口；
- 带版本或内容哈希的封面、歌词可以使用长期缓存；歌单 API 建议使用较短缓存或 ETag；
- 音频 URL 应保持稳定并支持浏览器分段读取。

## 12. 接入检查清单

- [ ] Vue 3 已把 `arcueid-music-player` 配置为自定义元素。
- [ ] 前台使用 `playlist-mode="readonly"`。
- [ ] `playlist-src` 与 `music-api` 只选择一种主数据源。
- [ ] Spring Boot 列表和详情响应符合本文结构。
- [ ] 默认歌单存在，或前台明确配置 `playlist-id`。
- [ ] `audioUrl`、`lyricUrl`、`cover` 能从博客 Origin 访问。
- [ ] 音频支持 `HEAD`、Range 和 `206 Partial Content`。
- [ ] Admin 写接口要求认证，前台播放器不持有管理凭据。
- [ ] 多实例使用独立 `memory-key` 和 `position-key`。
- [ ] 已验证播放、Seek、歌词、收缩、拖拽、左右停靠和移动端边界。
- [ ] 已在真实 Safari/iOS 上抽查音量、Seek、锁屏和后台恢复；该项不阻塞当前代码集成，但建议上线前完成。
