window.__ModuleLoader__.load({ id: "dsh-speech-input", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  SpeechInputButton: () => SpeechInputButton,
  apply: () => apply,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

// src/core.js
var CHINESE = /\p{Script=Han}/u;
var ASCII_WORD = /[A-Za-z0-9]/;
function boundarySpace(left, right) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return "";
  const last = left.at(-1);
  const first = right.at(0);
  if (ASCII_WORD.test(last) && ASCII_WORD.test(first)) return " ";
  if (/[,.!?:;]/.test(last) && ASCII_WORD.test(first)) return " ";
  return "";
}
function joinDraft(draft, speech) {
  const left = String(draft ?? "");
  const right = String(speech ?? "").trim();
  if (!right) return left;
  return `${left}${boundarySpace(left, right)}${right}`;
}
function joinSpeech(left, right) {
  const first = String(left ?? "").trim();
  const second = String(right ?? "").trim();
  if (!first) return second;
  if (!second) return first;
  return `${first}${boundarySpace(first, second)}${second}`;
}
function mergeRecognitionDraft(currentDraft, baseDraft, previousSpeech, nextSpeech) {
  const current = String(currentDraft ?? "");
  const base = String(baseDraft ?? "");
  const previous = String(previousSpeech ?? "").trim();
  const next = String(nextSpeech ?? "").trim();
  const previousRendered = joinDraft(base, previous);
  const nextRendered = joinDraft(base, next);
  if (!previous) {
    return current === base ? nextRendered : joinDraft(current, next);
  }
  if (current === previousRendered) return nextRendered;
  if (current.startsWith(previousRendered)) {
    return `${nextRendered}${current.slice(previousRendered.length)}`;
  }
  if (current.endsWith(previous)) {
    return `${current.slice(0, -previous.length)}${next}`;
  }
  if (next.startsWith(previous)) return joinDraft(current, next.slice(previous.length));
  return current;
}
function applyPunctuation(text, mode = "smart") {
  let value = String(text ?? "").trim();
  if (!value) return value;
  if (mode === "keep") return value;
  if (mode === "none") return value.replace(/\p{P}/gu, "").replace(/\s+/g, " ").trim();
  value = value.replace(/[，,]+\s*$/u, "").trim();
  if (!value || /[。！？.!?…]$/u.test(value)) return value;
  if (CHINESE.test(value)) {
    if (/[吗呢么]$/u.test(value)) return `${value}\uFF1F`;
    if (/[吧啊呀哦嘛啦哇哈]$/u.test(value)) return `${value}\uFF01`;
    return `${value}\u3002`;
  }
  return `${value}.`;
}
function readResults(results) {
  let finalText = "";
  let interimText = "";
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const transcript = String(result?.[0]?.transcript ?? "");
    if (result?.isFinal) finalText = joinSpeech(finalText, transcript);
    else interimText = joinSpeech(interimText, transcript);
  }
  return { finalText, interimText };
}
function failureReason(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "permission-denied";
  if (error === "audio-capture") return "microphone-unavailable";
  if (error === "network") return "network";
  return "recognition-failed";
}
var VoiceRecognitionController = class {
  constructor(options) {
    this.options = options;
    this.recognition = null;
    this.active = false;
    this.destroyed = false;
    this.generation = 0;
    this.baseDraft = "";
    this.speech = "";
    this.committedRounds = "";
    this.roundFinal = "";
    this.roundInterim = "";
    this.silentEnds = 0;
  }
  start() {
    if (this.destroyed || this.active) return false;
    this.active = true;
    this.generation += 1;
    this.baseDraft = String(this.options.getDraft() ?? "");
    this.speech = "";
    this.committedRounds = "";
    this.roundFinal = "";
    this.roundInterim = "";
    this.silentEnds = 0;
    this.options.onState({ phase: "starting" });
    return this.openRecognition(this.generation);
  }
  stop() {
    if (!this.active) return false;
    this.active = false;
    this.generation += 1;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition !== null) {
      try {
        recognition.stop();
      } catch {
      }
    }
    this.finishDraft();
    this.options.onState({ phase: "idle" });
    return true;
  }
  cancel() {
    if (!this.active) return false;
    this.active = false;
    this.generation += 1;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition !== null) {
      try {
        recognition.abort();
      } catch {
      }
    }
    this.updateDraft("");
    this.options.onState({ phase: "idle" });
    return true;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = false;
    this.generation += 1;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition !== null) {
      try {
        recognition.abort();
      } catch {
      }
    }
  }
  openRecognition(generation) {
    let recognition;
    try {
      recognition = this.options.createRecognition();
    } catch {
      this.active = false;
      this.options.onState({ phase: "error", reason: "unsupported" });
      return false;
    }
    if (recognition === null || recognition === void 0) {
      this.active = false;
      this.options.onState({ phase: "error", reason: "unsupported" });
      return false;
    }
    this.recognition = recognition;
    this.roundFinal = "";
    this.roundInterim = "";
    recognition.lang = this.options.language();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (this.active && generation === this.generation) {
        this.options.onState({ phase: "listening", speaking: false });
      }
    };
    recognition.onspeechstart = () => {
      if (this.active && generation === this.generation) {
        this.options.onState({ phase: "listening", speaking: true });
      }
    };
    recognition.onspeechend = () => {
      if (this.active && generation === this.generation) {
        this.options.onState({ phase: "listening", speaking: false });
      }
    };
    recognition.onresult = (event) => {
      if (!this.active || generation !== this.generation) return;
      const { finalText, interimText } = readResults(event.results);
      this.roundFinal = finalText;
      this.roundInterim = interimText;
      const round = joinSpeech(finalText, interimText);
      this.updateDraft(joinSpeech(this.committedRounds, round));
      if (round) this.silentEnds = 0;
    };
    recognition.onerror = (event) => {
      if (!this.active || generation !== this.generation) return;
      const error = String(event?.error ?? "unknown");
      if (error === "no-speech" || error === "aborted") return;
      this.active = false;
      this.generation += 1;
      this.recognition = null;
      this.options.onState({ phase: "error", reason: failureReason(error) });
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      if (!this.active || this.destroyed || generation !== this.generation) return;
      this.options.onState({ phase: "starting" });
      const round = joinSpeech(this.roundFinal, this.roundInterim);
      if (round) {
        this.committedRounds = joinSpeech(this.committedRounds, round);
        this.silentEnds = 0;
      } else {
        this.silentEnds += 1;
      }
      const restartGeneration = this.generation;
      const delay = Math.min(180 + this.silentEnds * 120, 1500);
      const schedule = this.options.schedule ?? ((callback, wait) => setTimeout(callback, wait));
      schedule(() => {
        if (this.active && !this.destroyed && restartGeneration === this.generation) {
          this.openRecognition(restartGeneration);
        }
      }, delay);
    };
    try {
      recognition.start();
      return true;
    } catch {
      this.active = false;
      this.recognition = null;
      this.options.onState({ phase: "error", reason: "start-failed" });
      return false;
    }
  }
  updateDraft(nextSpeech) {
    const next = String(nextSpeech ?? "").trim();
    const draft = mergeRecognitionDraft(
      this.options.getDraft(),
      this.baseDraft,
      this.speech,
      next
    );
    this.speech = next;
    this.options.setDraft(draft);
  }
  finishDraft() {
    if (!this.speech) return;
    this.updateDraft(applyPunctuation(this.speech, this.options.punctuation()));
  }
};

// src/client/index.js
var NS = "speech-input";
var zh = {
  start: "\u8BED\u97F3\u8F93\u5165\uFF08\u70B9\u51FB\u5F00\u59CB\uFF09",
  starting: "\u6B63\u5728\u542F\u52A8\u9EA6\u514B\u98CE\u2026",
  stop: "\u6B63\u5728\u542C\u5199\uFF0C\u70B9\u51FB\u505C\u6B62",
  cancel: "\u53D6\u6D88\u672C\u6B21\u8BED\u97F3\u8F93\u5165",
  waveform: "\u8BED\u97F3\u6D3B\u52A8",
  "listening-block": "\u6B63\u5728\u8BED\u97F3\u8F93\u5165\uFF0C\u505C\u6B62\u6216\u53D6\u6D88\u540E\u53EF\u53D1\u9001",
  busy: "\u53D1\u9001\u671F\u95F4\u6682\u65F6\u4E0D\u80FD\u4F7F\u7528\u8BED\u97F3\u8F93\u5165",
  unsupported: "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8BC6\u522B\uFF0C\u8BF7\u4F7F\u7528\u6700\u65B0\u7248 Edge \u6216 Chrome",
  "permission-denied": "\u9EA6\u514B\u98CE\u6743\u9650\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u5728\u6D4F\u89C8\u5668\u5730\u5740\u680F\u4E2D\u5141\u8BB8\u540E\u91CD\u8BD5",
  "microphone-unavailable": "\u6CA1\u6709\u68C0\u6D4B\u5230\u53EF\u7528\u9EA6\u514B\u98CE",
  network: "\u8BED\u97F3\u8BC6\u522B\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "recognition-failed": "\u8BED\u97F3\u8BC6\u522B\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  "start-failed": "\u9EA6\u514B\u98CE\u542F\u52A8\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
};
var en = {
  start: "Voice input (click to start)",
  starting: "Starting microphone\u2026",
  stop: "Listening, click to stop",
  cancel: "Cancel this dictation",
  waveform: "Voice activity",
  "listening-block": "Voice input is active; stop or cancel to send",
  busy: "Voice input is unavailable while sending",
  unsupported: "Speech recognition is unavailable; use the latest Edge or Chrome",
  "permission-denied": "Microphone permission was denied; allow it in the address bar and try again",
  "microphone-unavailable": "No working microphone was detected",
  network: "Speech recognition could not reach its service; try again later",
  "recognition-failed": "Speech recognition failed; try again",
  "start-failed": "The microphone could not start; try again"
};
var STYLES = `
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
`;
function installStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.querySelector('style[data-plugin-css="dsh-speech-input"]');
  if (existing !== null) return () => {
  };
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-speech-input";
  style.dataset.pluginCss = "dsh-speech-input";
  style.textContent = STYLES;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}
function speechConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
function recognitionLanguage() {
  if (typeof navigator === "undefined") return "zh-CN";
  const language = String(navigator.language ?? "").trim();
  return language || "zh-CN";
}
function MicrophoneIcon() {
  return import_react.default.createElement(
    "svg",
    {
      "aria-hidden": true,
      fill: "none",
      height: 17,
      viewBox: "0 0 24 24",
      width: 17
    },
    import_react.default.createElement("path", {
      d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2
    }),
    import_react.default.createElement("path", {
      d: "M19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2
    })
  );
}
function StopIcon() {
  return import_react.default.createElement("svg", {
    "aria-hidden": true,
    fill: "none",
    height: 16,
    viewBox: "0 0 24 24",
    width: 16
  }, import_react.default.createElement("rect", {
    fill: "currentColor",
    height: 9,
    rx: 1.5,
    width: 9,
    x: 7.5,
    y: 7.5
  }));
}
function CancelIcon() {
  return import_react.default.createElement("svg", {
    "aria-hidden": true,
    fill: "none",
    height: 16,
    viewBox: "0 0 24 24",
    width: 16
  }, import_react.default.createElement("path", {
    d: "m7 7 10 10M17 7 7 17",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeWidth: 2
  }));
}
function SpeechInputButton({ input, inputActions, setComposerBlocked, t }) {
  const live = import_react.default.useRef({ input, inputActions });
  live.current = { input, inputActions };
  const [voice, setVoice] = import_react.default.useState({ phase: "idle" });
  const controller = import_react.default.useRef(null);
  const supported = speechConstructor() !== null;
  const busy = input?.phase !== "plain";
  const ensureController = import_react.default.useCallback(() => {
    if (controller.current !== null) return controller.current;
    controller.current = new VoiceRecognitionController({
      createRecognition: () => {
        const Recognition = speechConstructor();
        return Recognition === null ? null : new Recognition();
      },
      getDraft: () => live.current.input?.draft ?? "",
      setDraft: (value) => {
        if (live.current.input?.phase === "plain") live.current.inputActions?.setDraft(value);
      },
      onState: setVoice,
      language: recognitionLanguage,
      punctuation: () => "smart"
    });
    return controller.current;
  }, []);
  import_react.default.useEffect(() => () => {
    controller.current?.destroy();
    controller.current = null;
  }, []);
  import_react.default.useEffect(() => {
    if (busy) controller.current?.stop();
  }, [busy]);
  const active = voice.phase === "starting" || voice.phase === "listening";
  const speaking = voice.phase === "listening" && voice.speaking === true;
  const error = voice.phase === "error";
  let label = t("start");
  if (!supported) label = t("unsupported");
  else if (busy) label = t("busy");
  else if (voice.phase === "starting") label = t("starting");
  else if (voice.phase === "listening") label = t("stop");
  else if (error) label = t(voice.reason ?? "recognition-failed");
  import_react.default.useEffect(() => {
    if (typeof setComposerBlocked !== "function") return void 0;
    setComposerBlocked(active ? { reason: t("listening-block") } : void 0);
    return () => {
      setComposerBlocked(void 0);
    };
  }, [active, setComposerBlocked, t]);
  const toggle = () => {
    const instance = ensureController();
    if (active) instance.stop();
    else instance.start();
  };
  const status = import_react.default.createElement("span", {
    "aria-live": "polite",
    className: "dsh-speech-input-status",
    role: "status"
  }, label);
  if (active) {
    return import_react.default.createElement(
      import_react.default.Fragment,
      null,
      import_react.default.createElement(
        "span",
        { className: "dsh-speech-input-active" },
        import_react.default.createElement("button", {
          "aria-label": t("cancel"),
          className: "dsh-speech-input-button",
          onClick: () => {
            ensureController().cancel();
          },
          title: t("cancel"),
          type: "button"
        }, import_react.default.createElement(CancelIcon)),
        import_react.default.createElement("span", {
          "aria-label": t("waveform"),
          className: "dsh-speech-input-waveform",
          "data-speaking": speaking ? "true" : "false",
          role: "img"
        }, ...Array.from({ length: 5 }, (_, index) => import_react.default.createElement("i", {
          "aria-hidden": true,
          key: index
        }))),
        import_react.default.createElement("button", {
          "aria-label": t("stop"),
          "aria-pressed": true,
          className: "dsh-speech-input-button",
          "data-active": "true",
          onClick: () => {
            ensureController().stop();
          },
          title: t("stop"),
          type: "button"
        }, import_react.default.createElement(StopIcon))
      ),
      status
    );
  }
  return import_react.default.createElement(
    import_react.default.Fragment,
    null,
    import_react.default.createElement("button", {
      "aria-label": label,
      "aria-pressed": false,
      className: "dsh-speech-input-button",
      "data-active": "false",
      "data-error": error ? "true" : "false",
      disabled: !supported || busy,
      onClick: toggle,
      title: label,
      type: "button"
    }, import_react.default.createElement(MicrophoneIcon)),
    status
  );
}
var inject = ["slots", "locale", "conversation"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-speech-input: dictionaries");
  ctx.effect(installStyles, "dsh-speech-input: styles");
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "speech-input-microphone",
    order: 10,
    locale: NS,
    inject: (sessionId) => {
      const blocks = ctx.conversation.blocks;
      const store = blocks.storeFor(sessionId);
      let ownedBlock;
      return {
        setComposerBlocked(block) {
          if (block !== void 0) {
            ownedBlock = block;
            blocks.set(sessionId, block);
            return;
          }
          const current = store.getSnapshot();
          if (ownedBlock !== void 0 && (current === ownedBlock || current?.reason === ownedBlock.reason)) {
            blocks.set(sessionId, void 0);
          }
          ownedBlock = void 0;
        }
      };
    }
  }, SpeechInputButton));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
