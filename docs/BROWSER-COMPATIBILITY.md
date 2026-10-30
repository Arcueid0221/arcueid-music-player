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
- 浮动窗口使用 Pointer Events；位置会在视口变化后重新限制到安全区域，localStorage 不可用时只关闭位置记忆。

## 跨域音频

只有需要 Web Audio 波形且音频来自其他域名时才设置 `crossOrigin: 'anonymous'`。音频服务器需要返回合适的 `Access-Control-Allow-Origin`。无法控制响应头时不要设置 `crossOrigin`，播放器仍可尝试原生播放，但分析波形可能不可用。

## Safari 拖动与媒体 Range 请求

- 波形拖动期间，光标、紫色已播放波形和当前时间共同使用视觉预览值；松手后只提交一次 seek，避免 Safari 为连续跳转重复发起媒体请求。
- 支持 `fastSeek()` 时优先使用浏览器的快速媒体跳转；seek 过程本身不会立即切换为“载入中”，只有跳转完成后仍缺少可播放数据才显示等待状态。
- 当前歌曲使用 `preload="auto"`，但 iOS Safari 可能根据省流量、低电量和内存策略限制预加载。
- 跳到尚未缓冲的位置时，任何浏览器都必须继续读取音频数据，无法由播放器完全消除。部署服务器应正确返回 `Accept-Ranges: bytes`、`Content-Length`、稳定的 `Content-Type`（如 `audio/mpeg`），并支持 `206 Partial Content`；否则 Safari 可能重新下载整首音频。
- `waiting` 状态延迟 180ms 后才显示，避免已缓冲 seek 产生一闪而过的“载入中”。
- WebKit（macOS Safari 和 iOS 上的所有浏览器）不把音频元素接入 Web Audio：一旦接入 `MediaElementAudioSourceNode`，跳转后旧位置的声音会和新位置叠在一起（“重音”）。本机对照实验证明这与服务器、CDN 缓存头、HTTP 版本和响应速度都无关；跳转时静音增益、先暂停再跳也无法消除。而原生输出在 Safari 上跳转明显卡顿。
- 因此 WebKit 采用接力播放：开始播放时由原生音频元素边下边播（立即出声，不接 Web Audio）；同时后台用 `fetch` 下载整首（需要 CORS）并 `decodeAudioData` 解码。解码完成后，波形先取自解码数据；下一次跳转、或暂停后再播放时，改由 `AudioBufferSourceNode` 直接播放解码后的音频，音频元素被释放。此后跳转只是重建一个 source 节点，瞬间完成且不会叠音，波形和音量（`GainNode`，iOS 上也有效）走原有的 Web Audio 图。
- 解码后的 PCM 约为 320 kbps MP3 的 15–20 倍（10 分钟立体声约 230 MB），因此只保留当前一首，切歌即释放。下载上限：iOS（含 iPadOS 桌面模式）24 MB，约 10 分钟 320 kbps；macOS Safari 64 MB。超过上限或下载、解码失败时一直使用原生播放（静态波形、跳转较慢，iOS 音量滑块无效）。
- 已知限制：切到 Web Audio 直接播放后，iOS 锁屏或进入后台时 Web Audio 可能被系统暂停，锁屏媒体控制也可能不可用；需要真机验证。

## 发布前矩阵

每次发布至少验证播放/暂停、拖动进度、音量、静音、两级歌单浏览、浏览时连续播放、点击歌曲后切换队列、歌词偏移、暗色主题、错误恢复、收缩/展开、拖拽/键盘停靠、移动端边界和后台返回。系统媒体键、锁屏信息、触摸拖拽和 iOS 后台恢复必须用真实设备验证，桌面自动化不能替代。
