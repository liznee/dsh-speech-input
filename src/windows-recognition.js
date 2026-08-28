/**
 * A browser-agnostic SpeechRecognition-shaped object backed by the Windows
 * engine bridge (bridge/win-asr-bridge.ps1). It mimics the subset of the Web
 * Speech API that VoiceRecognitionController consumes, so the controller and
 * SpeechInputButton work unchanged whether the recognizer is the browser's
 * webkitSpeechRecognition or this Windows-backed one.
 *
 * The bridge uses a single-shot RecognizeAsync pass: calling start() sends
 * POST /start (which blocks until one utterance is transcribed), then emits the
 * returned text as a final onresult. This is reliable across Windows versions
 * and does not depend on continuous-session event wiring.
 */
import { createWindowsEngineBridge } from './bridge-client.js'

export class WindowsBridgeRecognition {
  constructor({ launcher, baseUrl, fetchImpl, sleep } = {}) {
    this.bridge = createWindowsEngineBridge({ baseUrl, fetchImpl, sleep })
    this.launcher = launcher
    this.continuous = true
    this.interimResults = false
    this.lang = ''
    this.onstart = null
    this.onend = null
    this.onresult = null
    this.onerror = null
    this.onspeechstart = null
    this.onspeechend = null
    this._active = false
    this._generation = 0
  }

  async start() {
    if (this._active) return
    this._active = true
    const generation = ++this._generation
    let payload
    try {
      payload = await this.bridge.start(this.launcher)
    } catch (error) {
      this._active = false
      this.onerror?.({ error: error?.message === 'bridge-unavailable' ? 'bridge-unavailable' : 'start-failed' })
      this.onend?.()
      return
    }
    // The bridge returns { text, error } after a single recognition pass.
    if (payload?.error) {
      this._active = false
      this.onerror?.({ error: payload.error })
      this.onend?.()
      return
    }
    this.onstart?.()
    const text = typeof payload?.text === 'string' ? payload.text : ''
    if (text !== '') {
      this._emitResult(text, true)
    }
    this._active = false
    this.onend?.()
  }

  _emitResult(transcript, isFinal) {
    const result = [{ transcript }]
    result.isFinal = isFinal
    this.onresult?.({ resultIndex: 0, results: [result] })
  }

  async stop() {
    if (!this._active) return
    this._active = false
    this._generation += 1
    try {
      const final = await this.bridge.stop()
      if (final?.text) this._emitResult(final.text, true)
    } catch {
      /* ignore */
    }
    this.onend?.()
  }

  abort() {
    this._active = false
    this._generation += 1
    this.onend?.()
  }
}

/** Build a WindowsBridgeRecognition if we're on Windows with a launcher available. */
export function createWindowsRecognition(options) {
  if (typeof setInterval === 'undefined') return null
  return new WindowsBridgeRecognition(options)
}

export default createWindowsRecognition
