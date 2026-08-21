import React from 'react'
import { VoiceRecognitionController } from '../core.js'

const NS = 'speech-input'

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
.dsh-speech-input-active {
  align-items: center;
  display: inline-flex;
  flex: none;
  gap: 3px;
}
.dsh-speech-input-waveform {
  align-items: center;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  gap: 2px;
  height: 24px;
  justify-content: center;
  padding: 0 3px 5px;
  position: relative;
  width: 36px;
}
.dsh-speech-input-waveform::after {
  background: currentColor;
  bottom: 3px;
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
  height: 4px;
  transform-origin: center;
  width: 2px;
}
.dsh-speech-input-waveform[data-speaking='true'] > i {
  animation: dsh-speech-wave 620ms ease-in-out infinite alternate;
}
.dsh-speech-input-waveform > i:nth-child(2) { animation-delay: -420ms; }
.dsh-speech-input-waveform > i:nth-child(3) { animation-delay: -240ms; }
.dsh-speech-input-waveform > i:nth-child(4) { animation-delay: -520ms; }
.dsh-speech-input-waveform > i:nth-child(5) { animation-delay: -160ms; }
@keyframes dsh-speech-wave {
  0% { height: 4px; opacity: .65; }
  100% { height: 16px; opacity: 1; }
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
  .dsh-speech-input-waveform[data-speaking='true'] > i { animation: none; }
  .dsh-speech-input-waveform[data-speaking='true'] > i:nth-child(1),
  .dsh-speech-input-waveform[data-speaking='true'] > i:nth-child(5) { height: 7px; }
  .dsh-speech-input-waveform[data-speaking='true'] > i:nth-child(2),
  .dsh-speech-input-waveform[data-speaking='true'] > i:nth-child(4) { height: 12px; }
  .dsh-speech-input-waveform[data-speaking='true'] > i:nth-child(3) { height: 16px; }
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

export function SpeechInputButton({ input, inputActions, setComposerBlocked, t }) {
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
  const speaking = voice.phase === 'listening' && voice.speaking === true
  const error = voice.phase === 'error'
  let label = t('start')
  if (!supported) label = t('unsupported')
  else if (busy) label = t('busy')
  else if (voice.phase === 'starting') label = t('starting')
  else if (voice.phase === 'listening') label = t('stop')
  else if (error) label = t(voice.reason ?? 'recognition-failed')

  React.useEffect(() => {
    if (typeof setComposerBlocked !== 'function') return undefined
    setComposerBlocked(active ? { reason: t('listening-block') } : undefined)
    return () => { setComposerBlocked(undefined) }
  }, [active, setComposerBlocked, t])

  const toggle = () => {
    const instance = ensureController()
    if (active) instance.stop()
    else instance.start()
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
          className: 'dsh-speech-input-button',
          onClick: () => { ensureController().cancel() },
          title: t('cancel'),
          type: 'button',
        }, React.createElement(CancelIcon)),
        React.createElement('span', {
          'aria-label': t('waveform'),
          className: 'dsh-speech-input-waveform',
          'data-speaking': speaking ? 'true' : 'false',
          role: 'img',
        }, ...Array.from({ length: 5 }, (_, index) => React.createElement('i', {
          'aria-hidden': true,
          key: index,
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
