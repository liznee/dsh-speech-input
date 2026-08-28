// src/index.js
import { spawn } from "node:child_process";
var name = "dsh-speech-input";
var inject = ["webServer"];
var BRIDGE_PORT = 8765;
var BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;
var bridgeChild = null;
function bridgeScriptPath() {
  const url = new URL("../bridge/win-asr-bridge.ps1", import.meta.url);
  return url.pathname.replace(/^\/([A-Za-z]:)/, "$1");
}
function ensureBridge() {
  if (bridgeChild && bridgeChild.exitCode === null) return true;
  const script = bridgeScriptPath();
  bridgeChild = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-Port",
    String(BRIDGE_PORT)
  ], {
    windowsHide: true,
    stdio: "ignore"
  });
  bridgeChild.on("exit", () => {
    bridgeChild = null;
  });
  return true;
}
function stopBridge() {
  if (bridgeChild && bridgeChild.exitCode === null) {
    bridgeChild.kill();
  }
  bridgeChild = null;
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}
async function apply(ctx) {
  await ctx.effect(async () => {
    const webServer = ctx.webServer;
    const disposers = [
      // POST /dsh-speech-input/bridge/start -> spawn the bridge on demand.
      webServer.register({
        kind: "exact",
        path: "/dsh-speech-input/bridge/start",
        handler(req, res) {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "method_not_allowed" });
            return;
          }
          ensureBridge();
          sendJson(res, 200, { started: true, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE });
        }
      }),
      // POST /dsh-speech-input/bridge/stop -> stop the bridge.
      webServer.register({
        kind: "exact",
        path: "/dsh-speech-input/bridge/stop",
        handler(req, res) {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "method_not_allowed" });
            return;
          }
          stopBridge();
          sendJson(res, 200, { stopped: true });
        }
      }),
      // GET /dsh-speech-input/bridge/status
      webServer.register({
        kind: "exact",
        path: "/dsh-speech-input/bridge/status",
        handler(req, res) {
          const running = Boolean(bridgeChild && bridgeChild.exitCode === null);
          sendJson(res, 200, { running, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE });
        }
      })
    ];
    return async () => {
      for (const dispose of disposers.reverse()) await Promise.resolve(dispose?.());
      stopBridge();
    };
  }, "dsh-speech-input: bridge runtime");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
