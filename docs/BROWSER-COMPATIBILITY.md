# 浏览器兼容策略

## 支持目标

- Chrome、Edge、Firefox 当前两个主版本；
- macOS Safari 当前版本与前一主版本；
- iOS Safari 当前版本；
- 不支持 IE 和不具备原生 Web Components 的旧浏览器。

## 能力降级

- Media Session 不可用时，页面内播放控制保持可用；
- Web Audio 或跨域分析器不可用时，播放器退回原生媒体输出和静态波形；
- `prefers-reduced-motion` 下减少波形刷新并停用平滑滚动；
- localStorage、锁屏控制或 BFCache 不可用时不会阻塞基础播放。

## 跨域音频

只有需要 Web Audio 波形且音频来自其他域名时才设置 `crossOrigin: 'anonymous'`。音频服务器需要返回合适的 `Access-Control-Allow-Origin`。无法控制响应头时不要设置 `crossOrigin`，播放器仍可尝试原生播放，但分析波形可能不可用。

## 发布前矩阵

每次发布至少验证播放/暂停、拖动进度、音量、静音、队列编辑、歌词偏移、暗色主题、错误恢复和后台返回。系统媒体键、锁屏信息和 iOS 后台恢复必须用真实设备验证，桌面自动化不能替代。
