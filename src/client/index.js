import React from 'react'
import { createBrowserMicrophoneLevelMeter } from '../audio-level.js'
import { VoiceRecognitionController } from '../core.js'

const NS = 'speech-input'
const WAVEFORM_SEGMENTS = 16

/** How long to keep listening without detected speech before auto-stopping. */
export const DEFAULT_SILENCE_TIMEOUT_MS = 5_000
/** How long the "auto-stopped" notice stays visible on the button. */
export const SILENCE_NOTICE_MS = 2_600
/** Microphone RMS above this counts as voice activity for the silence clock. */
export const VOICE_ACTIVITY_THRESHOLD = 0.04

function emptyWaveform() {
  return Array.from({ length: WAVEFORM_SEGMENTS }, () => 0)
}

export const zh = {
  start: '语音输入（点击开始）',
  starting: '正在启动麦克风…',
  stop: '正在听写，点击停止',
  cancel: '取消本次语音输入',
  waveform: '语音活动',
  'listening-block': '正在语音输入，停止或取消后可发送',
  busy: '发送期间暂时不能使用语音输入',
  unsupported: '当前浏览器不支持语音识别，请使用最新版 Edge 或 Chrome',
  'permission-denied': '麦克风权限被拒绝，请在浏览器地址栏中允许后重试',
  'microphone-unavailable': '没有检测到可用麦克风',
  network: '语音识别网络连接失败，请稍后重试',
  'recognition-failed': '语音识别失败，请重试',
  'start-failed': '麦克风启动失败，请稍后重试',
  'auto-stopped': '已自动停止（静音超时）',
}

export const en = {
  start: 'Voice input (click to start)',
  starting: 'Starting microphone…',
  stop: 'Listening, click to stop',
  cancel: 'Cancel this dictation',
  waveform: 'Voice activity',
  'listening-block': 'Voice input is active; stop or cancel to send',
  busy: 'Voice input is unavailable while sending',
  unsupported: 'Speech recognition is unavailable; use the latest Edge or Chrome',
  'permission-denied': 'Microphone permission was denied; allow it in the address bar and try again',
  'microphone-unavailable': 'No working microphone was detected',
  network: 'Speech recognition could not reach its service; try again later',
  'recognition-failed': 'Speech recognition failed; try again',
  'start-failed': 'The microphone could not start; try again',
  'auto-stopped': 'Stopped automatically (silence)',
}

const STYLES = `
.dsh-speech-input-button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  box-sizing: border-box;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  height: 30px;
  justify-content: center;
  padding: 0;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
  width: 30px;
}
.dsh-speech-input-button:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dsh-speech-input-button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-focus-primary, currentColor);
  outline-offset: 2px;
}
.dsh-speech-input-button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.dsh-speech-input-button[data-active='true'] {
  background: transparent;
  border-color: color-mix(in srgb, var(--dsw-alias-label-primary) 48%, transparent);
  border-radius: 999px;
  border-width: 1px;
  color: var(--dsw-alias-label-primary);
}
.dsh-speech-input-button[data-error='true'] {
  color: var(--dsw-alias-state-warn-primary);
}
.dsh-speech-input-cancel {
  border: 1.5px solid rgba(127, 127, 127, .45);
  border-radius: 999px;
}
.dsh-speech-input-cancel:hover:not(:disabled) {
  background: rgba(127, 127, 127, .18);
  border-color: rgba(127, 127, 127, .65);
}
.dsh-speech-input-active {
  align-items: center;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, .14));
  border-radius: 999px;
  box-shadow: 0 0 0 1.5px rgba(127, 127, 127, .38), 0 2px 8px rgba(0, 0, 0, .20);
  display: inline-flex;
  flex: none;
  gap: 1px;
  height: 30px;
  padding: 0;
  /* 胶囊加长、波形撑满左右；普通窗口宽度下仍与左侧 +/权限 图标保持一行 */
  width: min(280px, 40vw);
}
.dsh-speech-input-waveform {
  align-items: center;
  color: var(--dsw-alias-label-primary);
  display: inline-flex;
  flex: 1 1 auto;
  gap: 0;
  height: 30px;
  justify-content: space-between;
  min-width: 40px;
  padding: 0 2px;
}
.dsh-speech-input-waveform > i {
  background: currentColor;
  border-radius: 999px;
  display: block;
  flex: none;
  min-height: 4px;
  transition: height 140ms ease-out, opacity 140ms linear;
  width: 4px;
}
/* 停止键五根音量条的呼吸动效：第 1 根→第 5 根依次轮着鼓包。
   从中心向上下两端对称放大一点（不是缩小、也不是顶部截断），再回到静止大小。 */
.dsh-speech-input-stop-bars path {
  animation: dsh-speech-input-bar-breathe .8s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes dsh-speech-input-bar-breathe {
  0%, 100% { opacity: .8; transform: scaleY(1); }
  50% { opacity: 1; transform: scaleY(1.1); }
}
.dsh-speech-input-stop-bars path:nth-child(1) { animation-delay: 0s; }
.dsh-speech-input-stop-bars path:nth-child(2) { animation-delay: .8s; }
.dsh-speech-input-stop-bars path:nth-child(3) { animation-delay: 1.6s; }
.dsh-speech-input-stop-bars path:nth-child(4) { animation-delay: 2.4s; }
.dsh-speech-input-stop-bars path:nth-child(5) { animation-delay: 3.2s; }
.dsh-speech-input-status {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-speech-input-button { transition: none; }
  .dsh-speech-input-waveform > i { transition: none; }
  .dsh-speech-input-stop-bars path { animation: none; }
}
`

function installStyles() {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector('style[data-plugin-css="dsh-speech-input"]')
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-speech-input'
  style.dataset.pluginCss = 'dsh-speech-input'
  style.textContent = STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

function speechConstructor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function recognitionLanguage() {
  if (typeof navigator === 'undefined') return 'zh-CN'
  const language = String(navigator.language ?? '').trim()
  return language || 'zh-CN'
}

function MicrophoneIcon() {
  return React.createElement('svg', {
    'aria-hidden': true,
    fill: 'none',
    height: 17,
    viewBox: '0 0 24 24',
    width: 17,
  },
  React.createElement('path', {
    d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2.5,
  }),
  React.createElement('path', {
    d: 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2.5,
  }))
}

function StopIcon() {
  const bars = [
    { x: 4, top: 15, bottom: 9 },
    { x: 8, top: 17.5, bottom: 6.5 },
    { x: 12, top: 19.5, bottom: 4.5 },
    { x: 16, top: 17.5, bottom: 6.5 },
    { x: 20, top: 15, bottom: 9 },
  ]
  return React.createElement('svg', {
    'aria-hidden': true,
    className: 'dsh-speech-input-stop-bars',
    fill: 'none',
    height: 26,
    viewBox: '0 0 24 24',
    width: 26,
  }, ...bars.map(bar => React.createElement('path', {
    d: `M${bar.x} ${bar.bottom}V${bar.top}`,
    key: bar.x,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 1.2,
  })))
}

function CancelIcon() {
  return React.createElement('svg', {
    'aria-hidden': true,
    fill: 'none',
    height: 16,
    viewBox: '0 0 24 24',
    width: 16,
  }, React.createElement('path', {
    d: 'm7 7 10 10M17 7 7 17',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 3,
  }))
}

export function SpeechInputButton({
  createMeter = createBrowserMicrophoneLevelMeter,
  input,
  inputActions,
  setComposerBlocked,
  t,
}) {
  const live = React.useRef({ input, inputActions })
  live.current = { input, inputActions }
  const mounted = React.useRef(true)
  const [voice, setVoice] = React.useState({ phase: 'idle' })
  const [waveformLevels, setWaveformLevels] = React.useState(emptyWaveform)
  const [silenceNotice, setSilenceNotice] = React.useState(false)
  const controller = React.useRef(null)
  const levelMeter = React.useRef(null)
  const noticeTimer = React.useRef(null)
  const supported = speechConstructor() !== null
  const busy = input?.phase !== 'plain'

  const clearNoticeTimer = React.useCallback(() => {
    if (noticeTimer.current === null) return
    clearTimeout(noticeTimer.current)
    noticeTimer.current = null
  }, [])

  const handleState = React.useCallback(state => {
    setVoice(state)
    if (state.phase === 'idle' && state.reason === 'silence') {
      clearNoticeTimer()
      setSilenceNotice(true)
      noticeTimer.current = setTimeout(() => {
        noticeTimer.current = null
        if (mounted.current) setSilenceNotice(false)
      }, SILENCE_NOTICE_MS)
    }
  }, [clearNoticeTimer])

  const recordLevel = React.useCallback(value => {
    if (!mounted.current) return
    const level = Math.max(0, Math.min(1, Number(value) || 0))
    // Acoustic voice activity (local microphone RMS) extends the silence
    // deadline even before the browser's speech service returns a transcript.
    if (level >= VOICE_ACTIVITY_THRESHOLD) controller.current?.markSpeech()
    setWaveformLevels(previous => [...previous.slice(1), level])
  }, [])

  const ensureMeter = React.useCallback(() => {
    if (levelMeter.current === null) levelMeter.current = createMeter(recordLevel) ?? false
    return levelMeter.current === false ? null : levelMeter.current
  }, [createMeter, recordLevel])

  const ensureController = React.useCallback(() => {
    if (controller.current !== null) return controller.current
    controller.current = new VoiceRecognitionController({
      createRecognition: () => {
        const Recognition = speechConstructor()
        return Recognition === null ? null : new Recognition()
      },
      getDraft: () => live.current.input?.draft ?? '',
      setDraft: value => {
        if (live.current.input?.phase === 'plain') live.current.inputActions?.setDraft(value)
      },
      onState: handleState,
      language: recognitionLanguage,
      punctuation: () => 'smart',
      silenceTimeoutMs: DEFAULT_SILENCE_TIMEOUT_MS,
    })
    return controller.current
  }, [handleState])

  React.useEffect(() => () => {
    mounted.current = false
    clearNoticeTimer()
    controller.current?.destroy()
    controller.current = null
    if (levelMeter.current !== false) levelMeter.current?.stop()
    levelMeter.current = null
  }, [clearNoticeTimer])

  React.useEffect(() => {
    if (busy) controller.current?.stop()
  }, [busy])

  const active = voice.phase === 'starting' || voice.phase === 'listening'
  const error = voice.phase === 'error'
  let label = t('start')
  if (!supported) label = t('unsupported')
  else if (busy) label = t('busy')
  else if (voice.phase === 'starting') label = t('starting')
  else if (voice.phase === 'listening') label = t('stop')
  else if (silenceNotice) label = t('auto-stopped')
  else if (error) label = t(voice.reason ?? 'recognition-failed')

  React.useEffect(() => {
    if (typeof setComposerBlocked !== 'function') return undefined
    setComposerBlocked(active ? { reason: t('listening-block') } : undefined)
    return () => { setComposerBlocked(undefined) }
  }, [active, setComposerBlocked, t])

  // 听写中按 Enter：立即停止录音并保留草稿（补标点），而不是只能点停止按钮。
  React.useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    const onKeyDown = event => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      // 不限输入框内：点完麦克风后焦点在按钮上，任意位置的 Enter 都视为"停止听写"
      event.preventDefault()
      event.stopImmediatePropagation()
      controller.current?.stop()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [active])

  React.useEffect(() => {
    if (active || levelMeter.current === null) return
    if (levelMeter.current !== false) levelMeter.current.stop()
    levelMeter.current = null
    setWaveformLevels(emptyWaveform())
  }, [active])

  const toggle = () => {
    clearNoticeTimer()
    setSilenceNotice(false)
    const instance = ensureController()
    if (active) instance.stop()
    else if (instance.start()) void ensureMeter()?.start()
  }

  const status = React.createElement('span', {
    'aria-live': 'polite',
    className: 'dsh-speech-input-status',
    role: 'status',
  }, label)

  if (active) {
    return React.createElement(React.Fragment, null,
      React.createElement('span', { className: 'dsh-speech-input-active' },
        React.createElement('button', {
          'aria-label': t('cancel'),
          className: 'dsh-speech-input-button dsh-speech-input-cancel',
          onClick: () => { ensureController().cancel() },
          title: t('cancel'),
          type: 'button',
        }, React.createElement(CancelIcon)),
        React.createElement('span', {
          'aria-label': t('waveform'),
          className: 'dsh-speech-input-waveform',
          'data-level': waveformLevels.at(-1).toFixed(3),
          role: 'img',
        }, ...waveformLevels.map((level, index) => React.createElement('i', {
          'aria-hidden': true,
          key: index,
          style: {
            height: `${4 + Math.round(level * 23)}px`,
            opacity: 0.45 + level * 0.55,
          },
        }))),
        React.createElement('button', {
          'aria-label': t('stop'),
          'aria-pressed': true,
          className: 'dsh-speech-input-button',
          'data-active': 'true',
          onClick: () => { ensureController().stop() },
          title: t('stop'),
          type: 'button',
        }, React.createElement(StopIcon)),
      ),
      status,
    )
  }

  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      'aria-label': label,
      'aria-pressed': false,
      className: 'dsh-speech-input-button',
      'data-active': 'false',
      'data-error': error ? 'true' : 'false',
      disabled: !supported || busy,
      onClick: toggle,
      title: label,
      type: 'button',
    }, React.createElement(MicrophoneIcon)),
    status,
  )
}

export const inject = ['slots', 'locale', 'conversation']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-speech-input: dictionaries')
  ctx.effect(installStyles, 'dsh-speech-input: styles')
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'speech-input-microphone',
    order: 10,
    locale: NS,
    inject: sessionId => {
      const blocks = ctx.conversation.blocks
      const store = blocks.storeFor(sessionId)
      let ownedBlock
      return {
        setComposerBlocked(block) {
          if (block !== undefined) {
            ownedBlock = block
            blocks.set(sessionId, block)
            return
          }
          const current = store.getSnapshot()
          if (ownedBlock !== undefined
            && (current === ownedBlock || current?.reason === ownedBlock.reason)) {
            blocks.set(sessionId, undefined)
          }
          ownedBlock = undefined
        },
      }
    },
  }, SpeechInputButton))
}
