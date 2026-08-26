# 项目架构

`arcueid-music-player` 是一个基于原生 Web Components、TypeScript、HTMLMediaElement 和 Web Audio 的可复用音乐播放器。它面向博客前台提供只读播放体验，通过 Provider 读取宿主数据，不承担博客后台 CMS 职责。

## 1. 设计目标

- 播放器可以独立构建并嵌入 Vue 3、静态页面或其他前端。
- Spring Boot 数据库和管理 API 不进入播放器内核。
- 播放状态只有一个来源，UI 不直接修改 Store 或 `<audio>`。
- 浏览器系统能力、持久化和网络数据源通过独立 Service 隔离。
- 队列管理 UI 可以关闭，但宿主配置和底层 Provider 保持可复用。
- 浮动窗口行为与播放逻辑分开，拖拽不污染 AudioEngine 或 PlayerState。

## 2. 当前目录

```text
arcueid-music-player/
├── public/
│   ├── audio/                         演示音频
│   └── lrc/                           演示歌词
├── src/
│   ├── domain/
│   │   ├── types.ts                   Song、PlayerState、事件 detail
│   │   ├── music-api.ts               Track、Playlist、PlaylistTrack
│   │   └── playlist.ts                纯队列索引和排序算法
│   ├── core/
│   │   ├── audio-engine.ts            HTMLAudioElement、Web Audio、Seek
│   │   ├── audio-analysis-source.ts   向多个波形共享分析帧
│   │   ├── player-store.ts            单一状态源
│   │   └── player-controller.ts       播放、切歌、歌词和错误恢复编排
│   ├── services/
│   │   ├── playlist-provider.ts       数组、直接 JSON、文件 Provider
│   │   ├── public-music-api-provider.ts Spring Boot Public API 适配
│   │   ├── lyric-parser.ts            LRC/逐字歌词解析
│   │   ├── lyric-repository.ts        歌词获取、缓存和取消
│   │   ├── playback-memory.ts         播放记忆
│   │   ├── playback-lifecycle.ts      后台保存与恢复
│   │   └── media-session.ts           系统媒体键和锁屏元数据
│   ├── data/
│   │   └── demo-playlist.ts            未配置外部数据源时的演示歌单
│   ├── ui/
│   │   ├── player-view.ts             DOM 组合和事件转发
│   │   ├── player.css                 Shadow DOM 样式和响应式规则
│   │   ├── floating-player.ts         收缩、拖拽、吸附和位置记忆
│   │   └── components/
│   │       ├── waveform.ts            主波形进度轨
│   │       ├── now-playing-rail.ts     当前歌词底栏
│   │       ├── lyric-view.ts           完整歌词面板
│   │       └── icon.ts                 Lucide 图标适配
│   ├── player-element.ts              Web Component 接入层
│   ├── create-player.ts               程序化挂载与多实例生命周期
│   └── index.ts                       注册元素和公共导出
├── docs/
│   ├── ARCHITECTURE.md                本文
│   ├── BLOG-INTEGRATION-API.md        博客完整接口契约
│   └── BROWSER-COMPATIBILITY.md       浏览器与媒体服务器边界
├── examples/minimal.html
├── index.html                         本地只读演示
├── browser-audit.html                 可编辑模式测试夹具
└── vite.config.ts
```

测试文件与对应模块同目录，使用 Vitest。Vite 同时输出 ESM、IIFE 和类型声明。

## 3. 依赖方向

```text
ArcueidMusicPlayer / createMusicPlayer
                │
       ┌────────┴────────┐
       ▼                 ▼
  PlayerView       PlayerController
       │            │    │    │
       │            ▼    ▼    ▼
       │          Store Engine Services
       │                         │
       └────────用户意图─────────┘

Public Music API
       ▼
PublicMusicApiProvider
       ▼
Song[]
       ▼
PlayerController → Store → PlayerView
```

约束：

1. `domain/` 不依赖 DOM、网络或音频 API。
2. `AudioEngine` 不知道歌单、歌词面板或浮动窗口。
3. `PlayerView` 不直接写 Store，也不直接设置音频 `currentTime`。
4. `PlayerController` 不创建 DOM，只编排播放用例。
5. Provider 只读取和规范化数据，不保存到博客后台。
6. `FloatingPlayerController` 只操作宿主元素的位置和收缩属性，不进入 PlayerState。

## 4. 核心模块

### 4.1 Web Component 接入层

`player-element.ts` 负责：

- 读取 HTML 属性并创建 Store、Engine、Controller 和 View；
- 选择 `playlist-src` 或 `music-api` 数据源；
- 暴露播放、歌单配置、主题和浮动窗口方法；
- 把 Store 变化转换为稳定 CustomEvent；
- 在断开 DOM 时释放订阅、AudioContext、动画和页面事件。

它不保存内联歌词、不绘制 Canvas，也不实现队列规则。

### 4.2 播放内核

`PlayerController` 是跨模块用例入口，负责播放/暂停、上一首/下一首、模式切换、Provider 加载、歌词切换、播放记忆、Media Session 同步以及失败重试/跳过。

`AudioEngine` 持有唯一 `HTMLAudioElement`。它封装媒体事件、缓冲位置、Web Audio GainNode 音量、Analyser、Safari Seek 降噪和资源释放，向 Controller 发布 `AudioSnapshot`。

`PlayerStore` 保存可序列化的 `PlayerState`。Canvas context、PointerEvent、AudioNode 和动画帧不会进入 Store。

### 4.3 数据源

所有 Provider 实现统一接口：

```ts
interface PlaylistProvider {
  load(options?: { signal?: AbortSignal }): Promise<Song[]>
}
```

- `ArrayPlaylistProvider`：宿主直接提供 `Song[]`；
- `JsonPlaylistProvider`：读取数组或包含 `playlist/songs` 的直接 JSON；
- `FilePlaylistProvider`：保留给显式 editable 模式或未来 Admin 工具；
- `PublicMusicApiProvider`：读取 Spring Boot `Track/Playlist/PlaylistTrack` 契约并映射成 `Song[]`。

`playlist-src` 优先于 `music-api`。Public Provider 可以通过 `playlist-id` 直读详情，也可以先读取列表并选择默认公开歌单。

### 4.4 UI

`PlayerView` 创建一次稳定的 Shadow DOM，订阅 Store 并把点击、键盘和指针输入转换为 Controller 方法。`playlist-mode="readonly"` 下，它不渲染队列管理按钮，并在事件层拒绝导入、删除和排序。

Canvas 分成两个消费者：主 `WaveformRenderer` 和 `NowPlayingRail`。二者共享 `AudioAnalysisSource`，每个动画帧只读取一次时域数据。

### 4.5 浮动窗口

`FloatingPlayerController` 负责：

- 展开与 128 × 54 迷你状态；
- 完整/迷你状态的独立拖拽手柄；
- 左右自动或固定吸附；
- 视口、安全区域和窗口缩放后的边界限制；
- 键盘移动与左右停靠；
- 可选 localStorage 位置记忆；
- `collapsechange` 和 `positionchange` 事件。

位置几何计算是纯函数并有单元测试。播放状态与浮动位置互不依赖。

## 5. 关键数据流

### 5.1 Spring Boot 歌单加载

```text
组件读取 music-api / playlist-id
  → PublicMusicApiProvider.fetch()
  → 解析 data 包装、Track 或 PlaylistTrack.track
  → 映射 audioUrl/lyricUrl/cover 为 Song
  → PlayerController.setPlaylist()
  → AudioEngine.load(currentSong)
  → Store 更新
  → PlayerView 渲染
```

### 5.2 播放时间与歌词

```text
AudioEngine timeupdate
  → AudioSnapshot
  → PlayerController
  → Store.currentTime / activeLyricIndex
  → PlayerView / LyricView / MediaSession
```

### 5.3 波形 Seek

```text
Pointer 拖动
  → PlayerView 只更新视觉预览
  → 紫色波形、光标和时间同步移动
Pointer 松开
  → Controller.seekRatio()
  → AudioEngine.fastSeek() 或 currentTime
```

拖动期间不会连续修改媒体时间，从而减少 Safari/iOS 的重复 Range 请求。

### 5.4 浮动拖拽

```text
独立拖拽手柄
  → FloatingPlayerController
  → 纯函数限制视口坐标
  → 松手后选择停靠侧
  → 更新宿主 left/top
  → 可选保存 localStorage
```

## 6. 已完成范围与延后项

当前已完成：播放内核、波形/歌词、只读队列、Public Music API Provider、Media Session、后台恢复、错误恢复、主题、多实例、收缩/拖拽/停靠和位置记忆。

当前没有实施博客部署工作：播放器尚未被写入具体 Vue 3 博客仓库，也没有实现 Spring Boot Controller、数据库表或 Vue 2 Admin 页面。这些属于宿主项目，接口契约见 [`BLOG-INTEGRATION-API.md`](./BLOG-INTEGRATION-API.md)。

## 7. 从旧项目到当前结构

旧 `xf-music-player` 已经具备播放、歌单、模式、Canvas 波形和同步歌词，但默认数据、音频事件、队列规则、DOM、样式与 Canvas 交互集中在组件生命周期中。本项目按职责拆开：

| 旧职责 | 当前模块 | 拆分结果 |
| --- | --- | --- |
| 歌曲、歌词和播放状态类型 | `domain/types.ts` | 跨层契约集中管理 |
| 上一首、下一首、随机索引 | `domain/playlist.ts` | 变为不依赖浏览器的纯函数 |
| Audio 与分析器回调 | `core/audio-engine.ts` | 统一发布音频快照并负责资源释放 |
| 零散组件状态 | `core/player-store.ts` | 收敛为单一状态源 |
| 切歌、歌词、错误恢复互调 | `core/player-controller.ts` | 跨模块流程只有一个编排入口 |
| 内联 LRC 与网络读取 | `services/lyric-*` + `public/lrc/` | 解析、缓存、取消和演示数据分离 |
| DOM、Canvas 与交互 | `ui/` | View 只渲染状态并转发用户意图 |
| 巨型自定义元素 | `player-element.ts` | 只保留生命周期、配置与公共 API |

相较旧实现，删除了组件内的大段默认歌词、逐节点内联样式、调试日志和 UI 对音频内部对象的直接访问；合并了重复的播放/暂停入口。新增了 Public Music API Provider、只读/可编辑队列边界、播放与位置记忆、Media Session、后台恢复、错误重试、逐字歌词、响应式共享波形、主题、多实例，以及可收缩、拖拽、吸附的浮动窗口。

相较参考项目 `s33806/music-player`，当前实现保留 Web Component、紧凑播放器、歌单/歌词/波形、播放模式和实例 API 的产品形态；没有引入 Lit、Howler、Zustand、国际化、插件体系或云端管理后台。宿主博客通过明确接口接入，而不是把 CMS 和鉴权继续塞回播放器。
