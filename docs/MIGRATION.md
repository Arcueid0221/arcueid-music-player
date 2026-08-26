# 版本迁移说明

## 从 0.1.0 早期重构版迁移

现有 `<arcueid-music-player>` 标签和原有播放方法保持兼容。新增能力均为可选：

- `theme="light|dark|system"` 控制主题，默认 `system`；
- `playlist-mode="readonly|editable"` 控制访客队列界面，默认 `readonly`；需要旧版导入、删除和排序入口时显式使用 `editable`；
- `setLyricOffset(ms)` 校准歌词，范围为 ±30 秒；
- `retry()` 与 `skipFailed()` 对应错误恢复；
- `createMusicPlayer(options)` 用于自定义挂载点和多实例生命周期；
- `trackchange`、`playbackchange`、`error` 和 `ready` 取代对内部 Store 的依赖；
- 跨域音频按歌曲设置 `crossOrigin: 'anonymous'`，服务端必须返回允许当前站点的 CORS 响应头。

如果旧代码直接访问 Shadow DOM、内部 Store 或 AudioEngine，应迁移到公开方法和事件。内部文件路径不属于稳定 API。

## SSR

包可以在没有 DOM 的服务端被导入，但只能在客户端创建播放器：

```ts
onMounted(async () => {
  const { createMusicPlayer } = await import('arcueid-music-player')
  createMusicPlayer({
    target: document.querySelector('#player')!,
    playlistMode: 'readonly',
  })
})
```
