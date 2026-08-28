// src/index.js
import { spawn } from "node:child_process";
var name = "dsh-speech-input";
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
function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (webServer === void 0 || typeof webServer.register !== "function") return;
  const startDispose = webServer.register({
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
  });
  const stopDispose = webServer.register({
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
  });
  const statusDispose = webServer.register({
    kind: "exact",
    path: "/dsh-speech-input/bridge/status",
    handler(req, res) {
      const running = Boolean(bridgeChild && bridgeChild.exitCode === null);
      sendJson(res, 200, { running, port: BRIDGE_PORT, baseUrl: BRIDGE_BASE });
    }
  });
  ctx.effect(() => {
    return () => {
      stopBridge();
      startDispose();
      stopDispose();
      statusDispose();
    };
  }, "dsh-speech-input: bridge lifecycle");
}
export {
  apply,
  name
};
//# sourceMappingURL=index.js.map
