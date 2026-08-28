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
// Declare the services this host half depends on. Declaring `webServer` is what
// makes ctx.webServer available inside apply(); without it the bridge routes
// would not register.
export const inject = ['webServer']

const BRIDGE_PORT = 8765
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`

let bridgeChild = null

/** Path to the bridge PowerShell script shipped with this package. */
function bridgeScriptPath() {
  const url = new URL('../bridge/win-asr-bridge.ps1', import.meta.url)
  // file:///C:/... -> C:/...
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

export async function apply(ctx) {
  await ctx.effect(async () => {
    const webServer = ctx.webServer
    const disposers = [
      // POST /dsh-speech-input/bridge/start -> spawn the bridge on demand.
      webServer.register({
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
      }),
      // POST /dsh-speech-input/bridge/stop -> stop the bridge.
      webServer.register({
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
      }),
      // GET /dsh-speech-input/bridge/status
      webServer.register({
        kind: 'exact',
        path: '/dsh-speech-input/bridge/status',
        async handler(req, res) {
          const running = Boolean(bridgeChild && bridgeChild.exitCode === null)
          // Surface the bridge's own recognition state/error (privacy gate,
          // no audio device, etc.) so it can be diagnosed without reaching the
          // bridge directly.
          let bridgeState = null
          if (running) {
            try {
              const health = await fetch(`${BRIDGE_BASE}/health`, { cache: 'no-store' })
              bridgeState = await health.json()
            } catch (error) {
              bridgeState = { reachable: false, error: String(error?.message ?? 'unreachable') }
            }
          }
          sendJson(res, 200, { running, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE, bridge: bridgeState })
        },
      }),
    ]
    return async () => {
      for (const dispose of disposers.reverse()) await Promise.resolve(dispose?.())
      stopBridge()
    }
  }, 'dsh-speech-input: bridge runtime')
}
