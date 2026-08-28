import React from 'react'
import { createBrowserMicrophoneLevelMeter } from '../audio-level.js'
import { VoiceRecognitionController } from '../core.js'
import { createWindowsRecognition } from '../windows-recognition.js'

const NS = 'speech-input'
const WAVEFORM_SEGMENTS = 24

// The plugin's apply() may configure a preferred recognition source (the
// Windows engine bridge) so the mic keeps working in China/offline where the
// browser Web Speech service is unreachable. Populated at load time.
let preferredRecognitionFactory = null

export function __setPreferredRecognition(factory) {
  preferredRecognitionFactory = factory ?? null
}

function emptyWaveform() {
  return Array.from({ length: WAVEFORM_SEGMENTS }, () => 0)
}

export const zh = {
  start: '语音输入（点击开始）',
  starting: '正在启动麦克风…',
  stop: '正在听写，点击停止',
  finishing: '正在完成听写…',
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
  'speech-privacy': '语音隐私未授权，请在“设置→隐私和安全性→语音”中开启语音识别',
}

export const en = {
  start: 'Voice input (click to start)',
  starting: 'Starting microphone…',
  stop: 'Listening, click to stop',
  finishing: 'Finishing dictation…',
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
  'speech-privacy': 'Speech privacy is not accepted; enable speech recognition in Settings > Privacy & security > Speech',
}

const STYLES = `
.dsh-speech-input-button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
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
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  border-radius: 999px;
  color: var(--dsw-alias-bg-layer-1);
}
.dsh-speech-input-button[data-error='true'] {
  color: var(--dsw-alias-state-warn-primary);
}
.dsh-speech-input-cancel {
  background: rgba(127, 127, 127, .20);
  border-color: transparent;
  border-radius: 999px;
}
.dsh-speech-input-cancel:hover:not(:disabled) {
  background: rgba(127, 127, 127, .30);
}
.dsh-speech-input-active {
  align-items: center;
  display: inline-flex;
  flex: none;
  gap: 3px;
  width: min(320px, 42vw);
}
.dsh-speech-input-waveform {
  align-items: center;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  flex: 1 1 auto;
  gap: 0;
  height: 30px;
  justify-content: space-between;
  min-width: 72px;
  padding: 0 3px;
  position: relative;
}
.dsh-speech-input-waveform::after {
  background: currentColor;
  bottom: 1px;
  content: '';
  height: 1px;
  left: 3px;
  opacity: .55;
  position: absolute;
  right: 3px;
}
.dsh-speech-input-waveform > i {
  background: currentColor;
  border-radius: 999px;
  display: block;
  flex: none;
  min-height: 2px;
  transition: height 140ms ease-out, opacity 140ms linear;
  width: 2px;
}
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
    strokeWidth: 2,
  }),
  React.createElement('path', {
    d: 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
  }))
}

function StopIcon() {
  return React.createElement('svg', {
    'aria-hidden': true,
    fill: 'none',
    height: 16,
    viewBox: '0 0 24 24',
    width: 16,
  }, React.createElement('rect', {
    fill: 'currentColor',
    height: 9,
    rx: 1.5,
    width: 9,
    x: 7.5,
    y: 7.5,
  }))
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
    strokeWidth: 2,
  }))
}

export function SpeechInputButton({
  createMeter = createBrowserMicrophoneLevelMeter,
  createRecognition,
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
  const controller = React.useRef(null)
  const levelMeter = React.useRef(null)
  const supported = createRecognition || preferredRecognitionFactory ? true : speechConstructor() !== null
  const busy = input?.phase !== 'plain'

  const recordLevel = React.useCallback(value => {
    if (!mounted.current) return
    const level = Math.max(0, Math.min(1, Number(value) || 0))
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
        // Preferred provider wins (Windows engine bridge, configured by apply);
        // otherwise fall back to the browser's Web Speech when available.
        if (preferredRecognitionFactory) {
          const recognition = preferredRecognitionFactory()
          if (recognition) return recognition
        }
        if (createRecognition) return createRecognition()
        const Recognition = speechConstructor()
        return Recognition === null ? null : new Recognition()
      },
      getDraft: () => live.current.input?.draft ?? '',
      setDraft: value => {
        if (live.current.input?.phase === 'plain') live.current.inputActions?.setDraft(value)
      },
      onState: setVoice,
      language: recognitionLanguage,
      punctuation: () => 'smart',
    })
    return controller.current
  }, [createRecognition])

  React.useEffect(() => () => {
    mounted.current = false
    controller.current?.destroy()
    controller.current = null
    if (levelMeter.current !== false) levelMeter.current?.stop()
    levelMeter.current = null
  }, [])

  React.useEffect(() => {
    if (busy) controller.current?.stop()
  }, [busy])

  const active = voice.phase === 'starting' || voice.phase === 'listening' || voice.phase === 'stopping'
  const error = voice.phase === 'error'
  let label = t('start')
  if (!supported) label = t('unsupported')
  else if (busy) label = t('busy')
  else if (voice.phase === 'starting') label = t('starting')
  else if (voice.phase === 'listening') label = t('stop')
  else if (voice.phase === 'stopping') label = t('finishing')
  else if (error) label = t(voice.reason ?? 'recognition-failed')

  React.useEffect(() => {
    if (typeof setComposerBlocked !== 'function') return undefined
    setComposerBlocked(active ? { reason: t('listening-block') } : undefined)
    return () => { setComposerBlocked(undefined) }
  }, [active, setComposerBlocked, t])

  React.useEffect(() => {
    if (active || levelMeter.current === null) return
    if (levelMeter.current !== false) levelMeter.current.stop()
    levelMeter.current = null
    setWaveformLevels(emptyWaveform())
  }, [active])

  const toggle = () => {
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
            height: `${2 + Math.round(level * 28)}px`,
            opacity: 0.4 + level * 0.6,
          },
        }))),
        React.createElement('button', {
          'aria-label': t('stop'),
          'aria-pressed': true,
          className: 'dsh-speech-input-button',
          'data-active': 'true',
          disabled: voice.phase === 'stopping',
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

// On Windows, prefer the local engine bridge (works in China with no Google
// reachable). The bridge is launched on demand by the host half; we just ask it
// to start and it exits on stop. Falls back to Web Speech where the bridge is
// not configured or unavailable.
function windowsCreateRecognition() {
  const launcher = () => fetch('/dsh-speech-input/bridge/start', { method: 'POST' })
  return createWindowsRecognition({ launcher })
}
export function apply(ctx) {
  // Prefer the Windows engine bridge so the mic works in China/offline; the
  // SpeechInputButton still falls back to Web Speech where the bridge is not
  // configured or is unavailable.
  __setPreferredRecognition(windowsCreateRecognition)
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
