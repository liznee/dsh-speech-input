# dsh-speech-input

[中文](#中文) | [English](#english)

## 中文

`dsh-speech-input` 为 DeepSeek Harness Web 输入框增加一个原生麦克风按钮。点击开始听写，识别结果实时写入当前草稿；再次点击停止并补全句末标点。插件不会自动发送消息。

### 特性

- 使用官方 `conversation.input.right` 插槽，不查询或改写 Harness DOM
- 支持 Chrome / Edge 的 Web Speech API，中英文跟随浏览器语言
- 中间识别结果原位更新，不会反复叠加同一句话
- 听写期间在识别文字后手工补写的内容会保留
- 无语音、停顿或浏览器结束单次识别时会持续自动续听，只有再次点击停止按钮才结束
- 听写中显示“灰色圆形取消 ×｜铺满可用宽度的实时音量条｜方块停止”，采用 Codex 风格，不使用红色录音状态
- 音量条通过 Web Audio API 在本地计算麦克风 RMS 音量，展示最近 24 个真实音量样本，不使用循环假动画
- 听写期间 Harness 的发送按钮和 Enter 发送会由官方接口置灰禁用；停止或取消后恢复
- 点击取消会移除本轮语音产生的全部文字，并保留开始听写前的草稿与可识别的手工追加内容
- 权限、麦克风或网络硬错误会给出明确提示
- 页面切换或插件卸载时中止识别并释放麦克风
- 支持键盘焦点、屏幕阅读器状态播报和减少动态效果偏好
- 纯浏览器插件，不需要额外 API key、服务端或模型下载

### 安装

发布到 npm 后：

```sh
dsh plugin --profile web add dsh-speech-input
```

从 GitHub 安装时，pnpm 需要获准运行 `prepare` 构建脚本；按 Harness 提示把包加入该 profile 的 `pnpm-workspace.yaml` `allowBuilds`，再重试安装。安装或升级后重启 `dsh web`。

本地 tarball：

```sh
npm ci
npm test
npm pack
dsh plugin --profile web add ./dsh-speech-input-0.1.0.tgz
```

### 隐私

插件本身不保存音频、不写日志，也不把音频发送给 Harness 或 DeepSeek。为了显示真实音量，插件会额外打开一条本地麦克风流，只连接到 Web Audio `AnalyserNode` 计算 RMS；不会播放、录制或上传该流，停止或取消时会立即关闭音轨。Web Speech API 的识别处理路径仍由浏览器决定：Edge/Chrome 通常会把识别音频交给浏览器厂商的在线语音服务。因此它不是离线识别；若不能接受该数据路径，请不要授权麦克风。

### 已知限制

- Firefox 当前没有可用的 Web Speech `SpeechRecognition` 实现，按钮会禁用。
- 识别质量、语言支持和服务可用性取决于浏览器及网络。
- 浏览器语言就是识别语言；首个版本没有独立语言设置。
- 插件只写草稿，绝不自动发送。

### Model Experience

识别文字只通过 Harness 的公开 `inputActions.setDraft()` 写入普通草稿。模型看不到音频、识别状态或任何额外系统提示；只有用户最终发送的文字会进入模型上下文。

## English

`dsh-speech-input` adds a native microphone control to the DeepSeek Harness Web composer. Click once to dictate into the current draft and again to stop. It never submits the message automatically.

It uses the public `conversation.input.right`, `inputActions.setDraft()`, and composer-block APIs. While listening it shows a gray circular cancel control, a full-width 24-segment meter driven by locally measured microphone RMS, and a square stop control; the host send action is disabled. Cancel removes the current dictation while preserving the pre-existing draft and recognizable manual suffix edits. It also supports interim-result replacement, reports permission and network failures, releases recognition and local metering tracks on teardown, and includes reduced-motion and screen-reader behavior.

Install after the package is published:

```sh
dsh plugin --profile web add dsh-speech-input
```

The plugin uses the browser Web Speech API. Edge and Chrome commonly send microphone audio to the browser vendor's online speech service. The plugin does not store audio or send it to Harness/DeepSeek, but it is not an offline recognizer.

## Development

```sh
npm ci
npm test
npm run test:coverage
npm run pack:check
```

Node.js 20 or newer is required for development. The built client is emitted in Harness's lazy CommonJS module-factory format.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
