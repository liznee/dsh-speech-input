/**
 * A browser-agnostic SpeechRecognition-shaped object backed by the Windows
 * engine bridge, via the DSH host's same-origin route. The browser never talks
 * to the bridge (127.0.0.1:8765) directly — that would be cross-origin and is
 * the source of the "no response" failures. Instead it talks to the plugin's
 * same-origin host routes:
 *   POST /dsh-speech-input/bridge/start   -> start continuous recognition
 *   POST /dsh-speech-input/bridge/result  -> read accumulated text
 *   POST /dsh-speech-input/bridge/stop    -> stop recognition
 *
 * VoiceRecognitionController treats recognizers as synchronous, event-driven
 * objects. We fire onstart synchronously (so the button leaves "starting"),
 * start the continuous session, then poll /result and emit onresult for any
 * newly accumulated text, exactly like a streaming recognizer.
 */
export class WindowsBridgeRecognition {
  constructor({ startEndpoint = '/dsh-speech-input/bridge/start', resultEndpoint = '/dsh-speech-input/bridge/result', stopEndpoint = '/dsh-speech-input/bridge/stop', fetchImpl, sleep } = {}) {
    this.startEndpoint = startEndpoint
    this.resultEndpoint = resultEndpoint
    this.stopEndpoint = stopEndpoint
    this.fetchImpl = fetchImpl || ((url, opts) => fetch(url, opts))
    this.sleep = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.continuous = true
    this.interimResults = true
    this.lang = ''
    this.onstart = null
    this.onend = null
    this.onresult = null
    this.onerror = null
    this._active = false
    this._generation = 0
    this._poller = null
    this._lastText = ''
  }

  async _post(endpoint) {
    const res = await this.fetchImpl(endpoint, { method: 'POST' })
    if (!res.ok) throw new Error(`bridge request failed (${res.status})`)
    return res.json()
  }

  start() {
    if (this._active) return
    this._active = true
    const generation = ++this._generation
    // Fire onstart synchronously so the controller leaves "starting".
    this.onstart?.()
    void this._begin(generation)
  }

  async _begin(generation) {
    let payload
    try {
      payload = await this._post(this.startEndpoint)
    } catch (error) {
      if (generation !== this._generation) return
      this._finishError(error?.message?.includes('unavailable') ? 'bridge-unavailable' : 'start-failed')
      return
    }
    if (generation !== this._generation) return
    if (payload?.error) {
      this._finishError(payload.error)
      return
    }
    this._poller = setInterval(() => { void this._poll(generation) }, 160)
  }

  async _poll(generation) {
    if (!this._active || generation !== this._generation) return
    let payload
    try {
      payload = await this._post(this.resultEndpoint)
    } catch {
      return
    }
    if (generation !== this._generation) return
    if (payload?.error) {
      this._finishError(payload.error)
      return
    }
    const text = typeof payload?.text === 'string' ? payload.text : ''
    if (text !== '' && text !== this._lastText) {
      this._lastText = text
      this._emitResult(text, true)
    }
  }

  _finishError(error) {
    this._active = false
    this._generation += 1
    if (this._poller) { clearInterval(this._poller); this._poller = null }
    this.onerror?.({ error })
    this.onend?.()
  }

  _emitResult(transcript, isFinal) {
    const result = [{ transcript }]
    result.isFinal = isFinal
    this.onresult?.({ resultIndex: 0, results: [result] })
  }

  stop() {
    if (!this._active) { this.onend?.(); return }
    this._active = false
    this._generation += 1
    if (this._poller) { clearInterval(this._poller); this._poller = null }
    void this._post(this.stopEndpoint).catch(() => {})
    this.onend?.()
  }

  abort() {
    this._active = false
    this._generation += 1
    if (this._poller) { clearInterval(this._poller); this._poller = null }
    this.onend?.()
  }
}

/** Build a WindowsBridgeRecognition (always available; recognition is host-backed). */
export function createWindowsRecognition(options) {
  return new WindowsBridgeRecognition(options)
}

export default createWindowsRecognition
