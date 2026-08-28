/**
 * A browser-agnostic SpeechRecognition-shaped object backed by the Windows
 * engine bridge (bridge/win-asr-bridge.ps1). It mimics the subset of the Web
 * Speech API that VoiceRecognitionController consumes, so the controller and
 * SpeechInputButton work unchanged whether the recognizer is the browser's
 * webkitSpeechRecognition or this Windows-backed one.
 *
 * In China (no Google reachable) Chrome's webkitSpeechRecognition cannot reach
 * its online endpoint, so clients may prefer this bridge on Windows.
 */
import { createWindowsEngineBridge } from './bridge-client.js'

export class WindowsBridgeRecognition {
  constructor({ launcher, baseUrl, fetchImpl, sleep } = {}) {
    this.bridge = createWindowsEngineBridge({ baseUrl, fetchImpl, sleep })
    this.launcher = launcher
    this.continuous = true
    this.interimResults = true
    this.lang = ''
    this.onstart = null
    this.onend = null
    this.onresult = null
    this.onerror = null
    this.onspeechstart = null
    this.onspeechend = null
    this._poller = null
    this._active = false
    this._generation = 0
  }

  async start() {
    if (this._active) return
    this._active = true
    const generation = ++this._generation
    try {
      await this.bridge.start(this.launcher)
    } catch (error) {
      this._active = false
      this.onerror?.({ error: error?.message === 'bridge-unavailable' ? 'bridge-unavailable' : 'start-failed' })
      this.onend?.()
      return
    }
    this.onstart?.()
    this._poll(generation)
  }

  _poll(generation) {
    if (!this._active || generation !== this._generation) return
    this._poller = setInterval(async () => {
      if (!this._active || generation !== this._generation) return
      let payload
      try {
        payload = await this.bridge.result()
      } catch {
        return
      }
      const { text, final } = payload ?? {}
      if (typeof text === 'string' && text !== '') {
        this._emitResult(text, final === true)
      }
    }, 160)
  }

  _emitResult(transcript, isFinal) {
    const result = [{ transcript }]
    result.isFinal = isFinal
    this.onresult?.({ resultIndex: 0, results: [result] })
  }

  async stop() {
    if (!this._active) return
    this._active = false
    const generation = ++this._generation
    if (this._poller) { clearInterval(this._poller); this._poller = null }
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
    if (this._poller) { clearInterval(this._poller); this._poller = null }
    this.onend?.()
  }
}

/** Build a WindowsBridgeRecognition if we're on Windows with a launcher available. */
export function createWindowsRecognition(options) {
  if (typeof setInterval === 'undefined') return null
  return new WindowsBridgeRecognition(options)
}

export default createWindowsRecognition
