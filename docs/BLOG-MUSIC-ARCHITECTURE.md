# 博客音乐架构与只读播放器目标

本文把 `arcueid-music-player` 定位为可配置、可复用的只读播放组件。博客后台负责内容管理，博客后端负责数据和权限，播放器只获取公开数据并提供播放体验。

## 1. 架构决策

```text
Blog Admin
  └─ Track / Playlist 管理、导入、排序、发布
          ↓ 需要管理员认证
Admin Music API
          ↓
Database
          ↑ 只读查询
Public Music API
          ↓
PlaylistProvider
          ↓
arcueid-music-player
          ↓
Blog Visitor
```

边界规则：

1. 播放器不直接连接数据库，也不持有管理员凭据。
2. 生产环境播放器只调用公开的只读音乐 API。
3. 添加、编辑、删除、导入和永久排序属于 Blog Admin，不属于 Player UI。
4. 随机播放、当前歌曲选择等只改变访客会话，不写回服务器歌单。
5. 通过配置禁用前台管理按钮是产品边界，不是安全措施；真正的权限边界必须由后端认证和只读/管理 API 分离保证。

## 2. 当前能力的去留

### Player UI 保留

- 查看当前歌曲、歌手、专辑和播放状态；
- 播放、暂停、上一首、下一首、Seek、音量和静音；
- 顺序、单曲循环和随机播放；
- 查看、搜索当前歌单并选择歌曲播放；
- 查看同步歌词、逐字歌词和调整本地歌词偏移；
- 波形进度、Media Session、后台恢复和错误恢复；
- 主题、播放记忆以及后续的收缩、拖拽和侧边停靠。

### 在只读 Player UI 中禁用

- “导入 JSON 歌单”按钮和文件选择器；
- 删除歌曲按钮；
- 上移、下移和拖拽永久排序入口；
- 面向访客的“导入成功/失败”等管理反馈；
- 暗示访客可以维护歌单的空状态文案。

### 迁移到未来的 Blog Admin

- JSON、M3U/M3U8、CSV 等歌单导入；
- 歌曲新增、编辑、删除和元数据维护；
- 歌单新增、编辑、删除、歌曲关联和永久排序；
- 默认歌单、公开状态和封面配置；
- 音频、歌词和封面资源管理。

### 底层能力继续保留

- `PlaylistProvider` 接口；
- `ArrayPlaylistProvider` 和面向公开 API 的 Provider；
- JSON 规范化、校验和 `FilePlaylistProvider`，供未来 Admin 导入工具复用；
- 队列增删、移动等纯领域函数和 Controller 能力，先作为内部能力及兼容层保留，不再从访客 UI 暴露。

宿主应用仍可以通过元素属性或 JavaScript 配置播放器。这里的“只读”指访客没有内容管理界面、播放器没有持久化写接口，并不禁止宿主在初始化时传入歌单。

播放器通过 `playlist-mode="readonly|editable"` 控制这一边界，默认值为 `readonly`。`editable` 只为旧版演示、本地调试或未来 Admin 工具保留，不建议博客前台启用。

## 3. 数据模型

后端持久化建议使用规范化模型：

```ts
interface Track {
  id: string
  title: string
  artist: string
  album?: string
  cover?: string
  audioUrl: string
  lyricUrl?: string
  duration?: number
}

interface Playlist {
  id: string
  name: string
  description?: string
  cover?: string
  isPublic: boolean
  isDefault: boolean
}

interface PlaylistTrack {
  playlistId: string
  trackId: string
  order: number
}
```

数据库中不把完整 `Track` 复制到每个 `Playlist`。公开 API 可以为了减少请求返回已经展开并按 `order` 排序的歌曲列表，`PlaylistProvider` 再把 `audioUrl`、`lyricUrl` 映射为播放器现有的 `Song.src`、`Song.lyricsUrl`。

## 4. API 职责

公开 API 只读，不接受管理员操作：

```text
GET /api/music/playlists
GET /api/music/playlists/:id
GET /api/music/tracks/:id
```

管理 API 属于博客后台，并且必须认证：

```text
POST   /api/admin/music/tracks
PATCH  /api/admin/music/tracks/:id
DELETE /api/admin/music/tracks/:id

POST   /api/admin/music/playlists
PATCH  /api/admin/music/playlists/:id
DELETE /api/admin/music/playlists/:id
POST   /api/admin/music/playlists/:id/tracks
DELETE /api/admin/music/playlists/:id/tracks/:trackId
PATCH  /api/admin/music/playlists/:id/order
```

这些写接口不在 `arcueid-music-player` 仓库实现。播放器仓库只定义稳定的公共响应契约和 Provider 适配。

## 5. 分阶段目标

### P6：访客端只读化（已完成）

- 增加 `playlist-mode="readonly|editable"`，默认只读；
- 只读模式禁用 JSON 文件导入、删除和永久排序 UI/事件；
- 保留歌单浏览、搜索、当前歌曲定位和选择播放；
- 调整空状态、反馈文案和键盘/触屏交互；
- 保持底层 Provider、Domain 和兼容 API 可测试。

完成标准：普通访客界面中不存在内容管理入口，现有播放、歌词、波形和队列浏览不回退。

### P7：公共音乐数据契约

- 为 Track、Playlist、PlaylistTrack 和公开响应增加明确类型；
- 增加面向博客 Public Music API 的 Provider/Adapter；
- 支持默认歌单和指定歌单 ID 配置；
- 记录加载失败、空歌单和字段缺失的降级规则。

完成标准：播放器可以只依赖公开 GET API 启动，不感知数据库或后台实现。

### P8：博客浮动播放器

- 增加展开/收缩和迷你播放器；
- 支持桌面鼠标与移动端触控拖拽；
- 支持左右侧吸附、视口边界和安全区域；
- 可选记忆位置、收缩状态和停靠侧；
- 拖拽手柄与波形、音量、歌词滚动的手势区域互不冲突。

完成标准：播放器可作为固定浮层嵌入博客，页面内容和播放器操作互不干扰。

### P9：宿主接入与发布

- 提供博客静态页面与 SPA 的接入示例；
- 防止路由切换时重复创建播放器或中断播放；
- 验证音频、歌词、封面的 CORS、Range 和缓存策略；
- 决定使用博客本地构建产物、CDN 或 npm 包；
- 同步 README、架构、迁移和浏览器兼容文档。

完成标准：博客只需要配置公开 API、主题和浮动行为即可使用播放器。

## 6. 验收边界

截至 2026-08-27，现有自动化测试、构建和浏览器审核结果可作为当前播放内核的验收依据。真实 macOS Safari/iOS Safari 的系统级行为仍建议在发布前抽查，但不再阻塞上述 P6–P9 的开发。
