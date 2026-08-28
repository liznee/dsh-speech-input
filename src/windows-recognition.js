/**
 * A browser-agnostic SpeechRecognition-shaped object backed by the Windows
 * engine bridge, via the DSH host's same-origin route. The browser never talks
 * to the bridge (127.0.0.1:8765) directly — that would be cross-origin and is
 * the source of the "no response" failures. Instead it POSTs to the plugin's
 * same-origin host route /dsh-speech-input/bridge/recognize, and the host
 * spawns the bridge, runs one recognition pass, and returns { text, error }.
 *
 * The returned text is emitted as a final onresult, so VoiceRecognitionController
 * and SpeechInputButton work unchanged.
 */
export class WindowsBridgeRecognition {
  constructor({ endpoint = '/dsh-speech-input/bridge/recognize', stopEndpoint = '/dsh-speech-input/bridge/stop', fetchImpl, sleep } = {}) {
    this.endpoint = endpoint
    this.stopEndpoint = stopEndpoint
    this.fetchImpl = fetchImpl || ((url, opts) => fetch(url, opts))
    this.sleep = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.continuous = true
    this.interimResults = false
    this.lang = ''
    this.onstart = null
    this.onend = null
    this.onresult = null
    this.onerror = null
    this._active = false
    this._generation = 0
  }

  async _post(endpoint) {
    const res = await this.fetchImpl(endpoint, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`bridge request failed (${res.status})`)
    }
    return res.json()
  }

  async start() {
    if (this._active) return
    this._active = true
    const generation = ++this._generation
    let payload
    try {
      payload = await this._post(this.endpoint)
    } catch (error) {
      this._active = false
      this.onerror?.({ error: error?.message?.includes('unavailable') ? 'bridge-unavailable' : 'start-failed' })
      this.onend?.()
      return
    }
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
    if (!this._active) { this.onend?.(); return }
    this._active = false
    this._generation += 1
    try {
      await this._post(this.stopEndpoint)
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

/** Build a WindowsBridgeRecognition (always available; recognition is host-backed). */
export function createWindowsRecognition(options) {
  return new WindowsBridgeRecognition(options)
}

export default createWindowsRecognition
