/**
 * Host half of dsh-speech-input.
 *
 * The browser bundle (src/client/index.js) owns the voice-input UI. This host
 * half exposes the on-demand launcher for the Windows speech bridge so the
 * client can start/stop the bridge without a long-lived background process.
 *
 * The bridge (bridge/win-asr-bridge.ps1) is spawned only when the client asks
 * to start recognition, and it exits on /stop or an idle timeout, so nothing
 * lingers between uses.
 */
import { spawn } from 'node:child_process'

export const name = 'dsh-speech-input'

const BRIDGE_PORT = 8765
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`

let bridgeChild = null
let bridgePort = 0

/** Path to the bridge PowerShell script shipped with this package. */
function bridgeScriptPath() {
  // In the packaged layout the bridge lives at package root /bridge.
  const url = new URL('../bridge/win-asr-bridge.ps1', import.meta.url)
  // On Windows fileURLToPath/URL yields a file:///C:/... path; strip the scheme.
  return url.pathname.replace(/^\/([A-Za-z]:)/, '$1')
}

/** Spawn the bridge on demand if it is not already running. */
function ensureBridge() {
  if (bridgeChild && bridgeChild.exitCode === null) return true
  const script = bridgeScriptPath()
  bridgeChild = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
    '-Port', String(BRIDGE_PORT),
  ], {
    windowsHide: true,
    stdio: 'ignore',
  })
  bridgeChild.on('exit', () => { bridgeChild = null })
  return true
}

/** Stop the bridge if it is running. */
function stopBridge() {
  if (bridgeChild && bridgeChild.exitCode === null) {
    bridgeChild.kill()
  }
  bridgeChild = null
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(body)
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined || typeof webServer.register !== 'function') return

  // POST /dsh-speech-input/bridge/start -> spawn the bridge on demand.
  const startDispose = webServer.register({
    kind: 'exact',
    path: '/dsh-speech-input/bridge/start',
    handler(req, res) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return
      }
      ensureBridge()
      sendJson(res, 200, { started: true, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE })
    },
  })

  // POST /dsh-speech-input/bridge/stop -> stop the bridge.
  const stopDispose = webServer.register({
    kind: 'exact',
    path: '/dsh-speech-input/bridge/stop',
    handler(req, res) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return
      }
      stopBridge()
      sendJson(res, 200, { stopped: true })
    },
  })

  // GET /dsh-speech-input/bridge/status
  const statusDispose = webServer.register({
    kind: 'exact',
    path: '/dsh-speech-input/bridge/status',
    handler(req, res) {
      const running = Boolean(bridgeChild && bridgeChild.exitCode === null)
      sendJson(res, 200, { running, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE })
    },
  })

  // Ensure the bridge never survives plugin unload.
  ctx.effect(() => {
    return () => {
      stopBridge()
      startDispose()
      stopDispose()
      statusDispose()
    }
  }, 'dsh-speech-input: bridge lifecycle')
}
