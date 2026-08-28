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

### 3.3 使用静态 JSON 多歌单

静态站点、对象存储或 CDN 可以直接提供多歌单配置，不需要 Spring Boot、MySQL 或 MinIO：

```vue
<arcueid-music-player
  playlist-config="/music/playlists.json"
  playlist-mode="readonly"
/>
```

`playlists.json` 示例：

```json
{
  "defaultPlaylistId": "focus",
  "playlists": [
    {
      "id": "focus",
      "name": "专注",
      "description": "适合工作时播放",
      "cover": "./covers/focus.jpg",
      "songs": [
        {
          "id": "track-1",
          "title": "Example",
          "artist": "Artist",
          "src": "./audio/example.mp3",
          "lyricsUrl": "./lyrics/example.lrc"
        }
      ]
    }
  ]
}
```

`id` 和 `name` 必填，歌单 ID 必须唯一；`songs` 必须是数组但可以为空。`defaultPlaylistId` 必须指向已有歌单，省略时选择唯一的 `isDefault: true` 歌单或第一项。`playlist-id` 属性可以覆盖默认选择。配置文件只请求一次，歌单封面、歌曲、歌词和 artwork 相对 URL 都以配置文件的最终响应 URL 为基准。

与现有 API 模式一致，两级歌单目录在 `playlist-mode="readonly"` 下启用；显式 `editable` 时只载入默认或指定歌单，并继续使用原有单队列编辑界面。

### 3.4 使用现有单一 JSON 接口

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

### 3.5 数据源优先级

组件连接或相关属性变化时按以下优先级加载：

1. `playlist-config`：使用 `ConfigPlaylistProvider` 读取多歌单 JSON；
2. `playlist-src`：使用 `JsonPlaylistProvider` 直接读取歌曲 JSON；
3. `music-api` + 可选 `playlist-id`：使用 `PublicMusicApiProvider`；
4. 三者都没有：使用通过 `player.playlist`、`createMusicPlayer({ playlist })` 提供的数据；未提供时使用仓库演示歌单。

同时配置多个数据源时严格按上述顺序选择；加载失败不会自动回退到下一数据源。检测到任一外部数据源时，播放器以空队列启动，加载失败后仍保持为空；只有完全未配置外部数据源时才使用 `playlist` 或内置演示歌单。

### 3.6 三种歌单源与参数详解

三种来源最终都会转换成播放器内部的 `Song[]`；`playlist-config` 和 `music-api` 还会转换成统一的 `ResolvedPlaylist`，因此共用多歌单目录、详情缓存和播放切换逻辑。

| 项目 | `playlist-config` | `playlist-src` | `music-api` |
| --- | --- | --- | --- |
| 数据来源 | 静态多歌单 JSON | 静态或动态单歌曲列表 JSON | 两级 HTTP API |
| Provider | `ConfigPlaylistProvider` | `JsonPlaylistProvider` | `PublicMusicApiProvider` |
| 多歌单目录 | 支持 | 不支持 | 支持 |
| 歌单名称、描述、封面 | 支持 | 不支持 | 支持 |
| `playlist-id` | 覆盖默认歌单 | 忽略 | 指定公开歌单 |
| `readonly` | 显示两级目录 | 显示单队列 | 显示两级目录 |
| `editable` | 只加载默认/指定歌单并编辑当前内存队列 | 编辑当前内存队列 | 只加载默认/指定歌单并编辑当前内存队列 |
| 后端依赖 | 无 | 无；URL 也可以是任意返回 JSON 的接口 | 需要兼容的 HTTP API |
| 写回来源 | 不会 | 不会 | 不会调用后台写接口 |

#### 3.6.1 `playlist-config`：静态多歌单

HTML 参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `playlist-config` | 是 | 配置 JSON URL；相对 URL 以博客页面地址解析 |
| `playlist-id` | 否 | 覆盖 JSON 中的默认歌单；找不到时组件目录模式回退到配置默认项 |
| `playlist-mode` | 否 | `readonly`（默认）显示多歌单目录；`editable` 只编辑默认/指定歌单的当前内存副本 |

根对象字段：

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `defaultPlaylistId` | `string \| number` | 否 | 必须匹配一个歌单 ID；优先于歌单级 `isDefault` |
| `playlists` | `PlaylistConfigItem[]` | 是 | 至少包含一个歌单 |

每个 `PlaylistConfigItem`：

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `id` | `string \| number` | 是 | 在整个配置中唯一；数字 `1` 和字符串 `"1"` 视为同一个 ID |
| `name` | `string` | 是 | 歌单目录显示名称 |
| `description` | `string` | 否 | 歌单卡片辅助文字 |
| `cover` | `string` | 否 | 歌单封面 URL，相对于配置文件最终响应 URL 解析 |
| `isDefault` | `boolean` | 否 | 未提供 `defaultPlaylistId` 时可标记默认歌单；此时最多一个为 `true` |
| `songs` | `SongInput[]` | 是 | 可以为空；歌曲数由播放器计算，不需要填写 `trackCount` |

默认歌单选择顺序：组件 `playlist-id` → `defaultPlaylistId` → 唯一的 `isDefault: true` → 第一项。Provider 在实例生命周期内只请求一次配置文件，目录与详情读取共用缓存。

#### 3.6.2 `playlist-src`：直接单歌单

HTML 参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `playlist-src` | 是 | 返回歌曲列表 JSON 的 URL |
| `playlist-mode` | 否 | `readonly`（默认）只播放；`editable` 显示导入、删除和排序控件 |
| `playlist-id` | 不适用 | `playlist-src` 没有歌单目录，因此该属性会被忽略 |

响应可以使用三种等价格式：

```json
[
  { "id": "one", "title": "One", "src": "./one.mp3" }
]
```

```json
{
  "songs": [
    { "id": "one", "title": "One", "src": "./one.mp3" }
  ]
}
```

```json
{
  "playlist": [
    { "id": "one", "title": "One", "src": "./one.mp3" }
  ]
}
```

它只描述歌曲队列，不支持歌单名称、歌单封面、默认歌单或多个歌单。如果未来需要这些信息，应改用 `playlist-config`。

#### 3.6.3 `music-api`：Aurora/Spring Boot API

HTML 参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `music-api` | 是 | API 根地址；结尾斜杠会被移除，例如 `/api/music` |
| `playlist-id` | 否 | 提供时指定初始歌单；省略时从列表选择 `isDefault` 或第一项 |
| `playlist-mode` | 否 | `readonly`（默认）显示公开多歌单目录；`editable` 只操作当前内存队列，不写回 API |

Provider 请求：

| 请求 | 用途 |
| --- | --- |
| `GET {music-api}/playlists` | 获取歌单目录和默认项 |
| `GET {music-api}/playlists/{playlist-id}` | 获取指定歌单歌曲详情 |

列表项字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string \| number` | 是 | 歌单 ID |
| `name` | `string` | 否 | 缺失时使用 ID 文本 |
| `description` | `string` | 否 | 歌单说明 |
| `cover` | `string` | 否 | 歌单封面 URL |
| `trackCount` | `number` | 否 | 目录显示歌曲数；播放器会规范为非负整数 |
| `isPublic` | `boolean` | 否 | 明确为 `false` 时从公开目录过滤 |
| `isDefault` | `boolean` | 否 | 默认歌单标志 |

列表响应可直接是数组、`{ "data": [...] }`，或 `{ "data": { "playlists": [...] } }`。详情响应可直接返回对象或包在 `data` 中；歌曲数组键接受 `tracks`、`playlistTracks` 或兼容键 `songs`。关联形式的 `PlaylistTrack` 必须展开 `track`。

如果 API 希望表示“成功加载但没有歌曲”，列表中仍应返回一个歌单，详情返回 `"tracks": []`。列表直接为空表示没有可浏览歌单，会作为加载错误处理。

#### 3.6.4 两种 JSON 来源共用的 `SongInput`

`playlist-config.songs` 与 `playlist-src` 使用相同字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string \| number` | 否 | 缺失时根据 `src` 和数组位置生成稳定于本次解析的 ID |
| `title` | `string` | 是 | 歌曲标题 |
| `artist` | `string` | 否 | 艺术家 |
| `album` | `string` | 否 | 专辑 |
| `src` | `string` | 是 | 音频 URL；相对于 JSON 最终响应 URL 解析 |
| `duration` | `number` | 否 | 秒数；负值规范为 `0` |
| `artwork` | `MediaImage[]` | 否 | 每项至少包含 `src`，可带 `sizes`、`type` |
| `crossOrigin` | `"" \| "anonymous" \| "use-credentials"` | 否 | 跨域媒体元素设置；波形分析常用 `anonymous` |
| `lyrics` | `string \| LyricLine[]` | 否 | 内联 LRC 文本或结构化歌词 |
| `lyricsUrl` | `string` | 否 | 外部歌词 URL；相对于 JSON 最终响应 URL 解析 |

结构化 `LyricLine` 使用 `{ timeMs, text, kind?, words? }`；逐字项使用 `{ startMs, endMs?, text }`。`artwork[].src`、`src` 和 `lyricsUrl` 都会解析相对路径。

API 的 Track 使用 `audioUrl`、`lyricUrl`、`cover`，Provider 分别映射为 `Song.src`、`Song.lyricsUrl`、`Song.artwork[0].src`；兼容情况下也接受 `src` 和 `lyricsUrl`。

#### 3.6.5 三源共用的播放器参数

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `playlist-mode` | `readonly` | `readonly` 隐藏导入、删除、排序；`editable` 只修改浏览器内存 |
| `play-mode` | `order` | `order` 顺序、`single` 单曲循环、`random` 随机 |
| `volume` | `0.8` | `0`–`1` 初始/当前音量 |
| `theme` | `system` | `light`、`dark` 或跟随系统 |
| `remember-playback` | 关闭 | 保存歌曲 ID、进度、音量、静音和播放模式 |
| `memory-key` | 内置默认键 | 多实例或多页面隔离播放记忆 |
| `collapsed` | 关闭 | 初始化或动态收缩为迷你播放器 |
| `dock-side` | `auto` | `auto`、`left`、`right` 停靠策略 |
| `remember-position` | 关闭 | 保存位置、停靠侧与收缩状态 |
| `position-key` | 派生默认键 | 多实例隔离位置记忆 |

布尔属性按“是否存在”判断；例如 `remember-playback="false"` 仍会启用，应通过移除属性关闭。外部 JSON、API、音频、歌词和封面必须满足浏览器同源策略或提供正确 CORS 响应。

## 4. HTML 属性

| 属性 | 值/默认值 | 作用 | 动态变化 |
| --- | --- | --- | --- |
| `playlist-config` | URL | 静态多歌单 JSON 地址，优先级最高 | 重新加载歌单 |
| `music-api` | URL | Public Music API 根地址，例如 `/api/music` | 重新加载歌单 |
| `playlist-id` | string/number | 指定 Config/API 歌单；省略时自动发现默认歌单 | 重新加载歌单 |
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
  playlistConfig: '/music/playlists.json',
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

这里的 `Playlist` 是为兼容 Aurora 保留的后端 DTO。播放器内部统一使用来源无关的运行时模型：

```ts
interface ResolvedPlaylist extends PlaylistSummary {
  songs: Song[]
}
```

`ConfigPlaylistProvider` 和 `PublicMusicApiProvider` 都实现 `PlaylistCatalogProvider` 并输出该模型，因此 UI 不依赖数据来自静态 JSON 还是 API。

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
- 通过 `playlist-config` / `music-api` / `playlist-src` 属性触发的加载失败不会派发媒体 `error` 事件；需要程序化确认结果时，应使用并捕获 `loadPlaylist(provider)` 返回的 Promise。

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
- [ ] `playlist-config`、`playlist-src` 与 `music-api` 只选择一种主数据源。
- [ ] 静态配置或 Spring Boot 列表和详情响应符合本文结构。
- [ ] 默认歌单存在，或前台明确配置 `playlist-id`。
- [ ] `audioUrl`、`lyricUrl`、`cover` 能从博客 Origin 访问。
- [ ] 音频支持 `HEAD`、Range 和 `206 Partial Content`。
- [ ] Admin 写接口要求认证，前台播放器不持有管理凭据。
- [ ] 多实例使用独立 `memory-key` 和 `position-key`。
- [ ] 已验证播放、Seek、歌词、收缩、拖拽、左右停靠和移动端边界。
- [ ] 已在真实 Safari/iOS 上抽查音量、Seek、锁屏和后台恢复；该项不阻塞当前代码集成，但建议上线前完成。
