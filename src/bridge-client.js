/**
 * Windows-engine bridge client.
 *
 * Talks to an on-demand PowerShell bridge (bridge/win-asr-bridge.ps1) that wraps
 * the Windows offline Chinese speech engine. The bridge is launched by the host
 * half of this plugin (src/index.js) when the user clicks the mic, and it exits
 * on /stop or after an idle timeout, so it never lingers in the background.
 *
 * In China (no Google reachable) Chrome's webkitSpeechRecognition cannot reach
 * its online service, so this client provides a browser-agnostic fallback that
 * transcribes via the local Windows engine over HTTP (CORS-enabled).
 */

const BRIDGE_HOST = 'http://127.0.0.1:8765'

async function request(path, method = 'GET', body) {
  const options = {
    method,
    headers: { 'X-DSH-Speech': '1' },
  }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const response = await fetch(`${BRIDGE_HOST}${path}`, options)
  if (!response.ok) {
    const error = new Error(`bridge ${path} failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return response.json()
}

export function createWindowsEngineBridge({
  baseUrl = BRIDGE_HOST,
  fetchImpl = (url, opts) => fetch(url, opts),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxStartAttempts = 20,
  startDelayMs = 100,
} = {}) {
  const root = baseUrl.replace(/\/$/, '')
  const call = async (path, method = 'GET', body) => {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: { 'X-DSH-Speech': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) {
      const error = new Error(`bridge ${path} failed (${response.status})`)
      error.status = response.status
      throw error
    }
    return response.json()
  }

  let active = false
  let stopped = false

  return {
    /** Probe whether the bridge process is already listening. */
    async isAlive() {
      try {
        await call('/health')
        return true
      } catch {
        return false
      }
    },

    /** Ask the host-backed launcher to start the bridge, then wait until it is ready. */
    async ensureStarted(launcher) {
      for (let attempt = 0; attempt < maxStartAttempts; attempt += 1) {
        if (await this.isAlive()) return true
        if (launcher) {
          try { await launcher() } catch { /* ignore */ }
        }
        await sleep(startDelayMs)
      }
      return this.isAlive()
    },

    /** Begin continuous recognition through the bridge. */
    async start(launcher) {
      active = true
      stopped = false
      const ready = await this.ensureStarted(launcher)
      if (!ready) throw new Error('bridge-unavailable')
      return call('/start', 'POST')
    },

    /** Read the latest recognized text. */
    async result() {
      return call('/result')
    },

    /** Stop recognition and return the final text, then the bridge exits. */
    async stop() {
      stopped = true
      let payload
      try {
        payload = await call('/stop', 'POST')
      } catch {
        payload = { text: '' }
      }
      active = false
      stopped = true
      return payload
    },

    get isActive() { return active },
    get isStopped() { return stopped },
  }
}

export default createWindowsEngineBridge
