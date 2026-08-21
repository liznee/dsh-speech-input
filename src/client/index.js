import React from 'react'
import { VoiceRecognitionController } from '../core.js'

const NS = 'speech-input'

export const zh = {
  start: '语音输入（点击开始）',
  starting: '正在启动麦克风…',
  stop: '正在听写，点击停止',
  busy: '发送期间暂时不能使用语音输入',
  unsupported: '当前浏览器不支持语音识别，请使用最新版 Edge 或 Chrome',
  'permission-denied': '麦克风权限被拒绝，请在浏览器地址栏中允许后重试',
  'microphone-unavailable': '没有检测到可用麦克风',
  network: '语音识别网络连接失败，请稍后重试',
  'recognition-failed': '语音识别失败，请重试',
  'start-failed': '麦克风启动失败，请稍后重试',
}

export const en = {
  start: 'Voice input (click to start)',
  starting: 'Starting microphone…',
  stop: 'Listening, click to stop',
  busy: 'Voice input is unavailable while sending',
  unsupported: 'Speech recognition is unavailable; use the latest Edge or Chrome',
  'permission-denied': 'Microphone permission was denied; allow it in the address bar and try again',
  'microphone-unavailable': 'No working microphone was detected',
  network: 'Speech recognition could not reach its service; try again later',
  'recognition-failed': 'Speech recognition failed; try again',
  'start-failed': 'The microphone could not start; try again',
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
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  animation: dsh-speech-input-pulse 1.2s ease-in-out infinite;
}
.dsh-speech-input-button[data-error='true'] {
  color: var(--dsw-alias-state-warn-primary);
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
@keyframes dsh-speech-input-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 28%, transparent); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-speech-input-button { transition: none; }
  .dsh-speech-input-button[data-active='true'] { animation: none; }
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

export function SpeechInputButton({ input, inputActions, t }) {
  const live = React.useRef({ input, inputActions })
  live.current = { input, inputActions }
  const [voice, setVoice] = React.useState({ phase: 'idle' })
  const controller = React.useRef(null)
  const supported = speechConstructor() !== null
  const busy = input?.phase !== 'plain'

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
      onState: setVoice,
      language: recognitionLanguage,
      punctuation: () => 'smart',
    })
    return controller.current
  }, [])

  React.useEffect(() => () => {
    controller.current?.destroy()
    controller.current = null
  }, [])

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
  else if (error) label = t(voice.reason ?? 'recognition-failed')

  const toggle = () => {
    const instance = ensureController()
    if (active) instance.stop()
    else instance.start()
  }

  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      'aria-label': label,
      'aria-pressed': active,
      className: 'dsh-speech-input-button',
      'data-active': active ? 'true' : 'false',
      'data-error': error ? 'true' : 'false',
      disabled: !supported || busy,
      onClick: toggle,
      title: label,
      type: 'button',
    }, React.createElement(MicrophoneIcon)),
    React.createElement('span', {
      'aria-live': 'polite',
      className: 'dsh-speech-input-status',
      role: 'status',
    }, label),
  )
}

export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-speech-input: dictionaries')
  ctx.effect(installStyles, 'dsh-speech-input: styles')
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'speech-input-microphone',
    order: 10,
    locale: NS,
  }, SpeechInputButton))
}
