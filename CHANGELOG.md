# Changelog

All notable changes to this project are documented in this file.

## [0.2.1] - 2026-08-29

### Changed

- **Silence timeout default 15s → 5s**: auto-stop now kicks in after 5 seconds
  without detected speech (`DEFAULT_SILENCE_TIMEOUT_MS`).
- **Listening capsule rework**: the cancel–waveform–stop bar is framed as an
  oval pill with a subtle ring and shadow. End-cap curvature now exactly matches
  the circular buttons (border-box sizing), so the pill reads as a circle cut
  and stretched in the middle.
- **Crisper strokes**: the outer ring, waveform bars (2 px → 4 px, primary
  color), and icons were thickened so nothing looks pixelated.
- **New stop icon**: the stop control shows five vertical volume bars
  (low–high–low) with rounded caps inside the outlined circle; cancel and stop
  are now symmetric outlined circles.
- Removed the thin baseline under the waveform.

## [0.2.0] - 2026-08-27

### Added

- **Auto-stop on silence**: after 15 seconds without detected speech the
  recording stops automatically (like a manual stop — the dictation is kept,
  punctuation is applied, and the microphone is released), with a brief
  "auto-stopped" notice on the button. The silence deadline is anchored to the
  last **real** speech: only brand-new transcript text or actual microphone
  voice activity (local RMS ≥ `VOICE_ACTIVITY_THRESHOLD`) extends it — ambient
  noise (`onspeechstart`), identical re-emitted results, and silent browser
  session restarts never do. Tune `DEFAULT_SILENCE_TIMEOUT_MS` in
  `src/client/index.js`, or set it to `0` to disable. The controller accepts
  `silenceTimeoutMs` and an injected `now()` clock for testability.

## [0.1.9] - 2026-08-27

### Fixed

- **Fix the "no transcription" root cause**: the bridge used a
  `Windows.Foundation.TypedEventHandler[...]` delegate for continuous
  recognition, which PowerShell cannot resolve — the bridge returned
  "找不到类型 [Windows.Foundation.TypedEventHandler]" and never started
  recognition. The bridge now uses single-shot
  `SpeechRecognizer.RecognizeAsync` (no event delegate), so it works in
  PowerShell. Also clears any stale bridge process squatting on the bridge port
  so the host can spawn a fresh one.

## [0.1.8] - 2026-08-27

### Changed

- Switch the Windows bridge to **continuous recognition**
  (`ContinuousRecognitionSession`) so text accumulates as the user keeps
  speaking, matching Win+H behavior. The `/start` handler is now non-blocking and
  the client polls `/result` for accumulated text. This addresses cases where a
  single-shot `RecognizeAsync` returned an empty result because it captured only
  a short utterance.

## [0.1.7] - 2026-08-27

### Fixed

- **Fix the "no reaction at all" root cause**: the Windows bridge recognizer is
  asynchronous, but `VoiceRecognitionController` treats recognizers as
  synchronous, event-driven objects. The recognizer now fires `onstart`
  synchronously (so the button leaves "正在启动麦克风…") and performs the
  async recognition in the background, delivering the result as an `onresult`
  event. Previously the client stayed stuck at "starting" and never sent the
  recognition request.

## [0.1.6] - 2026-08-27

### Changed

- **Fix the "no transcription" root cause**: the browser no longer talks to the
  bridge at `127.0.0.1:8765` directly (cross-origin, which hung in Chrome). The
  browser now POSTs to the same-origin host route
  `/dsh-speech-input/bridge/recognize`, and the host spawns the bridge, runs one
  recognition pass, and returns `{ text, error }`. This removes the cross-origin
  failure that produced no response.

## [0.1.5] - 2026-08-27

### Changed

- The Windows bridge now uses a single-shot `RecognizeAsync` pass (instead of the
  continuous-session event wiring), returning the recognized text directly from
  `/start`. This is more reliable across Windows versions and does not depend on
  continuous-session `ResultGenerated`/`HypothesisGenerated` event handlers
  firing. The client adapter reads the text from `/start` and emits it as a final
  result.
- `/dsh-speech-input/bridge/status` now also reports the bridge's own error
  (e.g. speech-privacy gate) so failures can be diagnosed.

## [0.1.4] - 2026-08-27

### Fixed

- The host half now declares `webServer` in its `inject`, so the bridge launch
  routes (`/dsh-speech-input/bridge/start|stop|status`) actually register. The
  bridge previously could not be started because the DSH host did not inject the
  `webServer` service into the plugin context.

## [0.1.3] - 2026-08-27

### Fixed

- The Windows bridge now reports why recognition did not start (e.g. the
  speech-privacy gate or no audio device) through `/start` and `/health`, and the
  UI shows a clear, actionable message instead of failing silently.

## [0.1.2] - 2026-08-27

### Added

- Windows-local speech recognition via the on-demand bridge
  (`bridge/win-asr-bridge.ps1`), so voice input works in Chrome/Edge in China
  and offline where the browser Web Speech service (Google) is unreachable.
  The bridge uses `Windows.Media.SpeechRecognition` (zh-Hans-CN offline
  package), is launched by the plugin host only when the mic is clicked, and
  exits on stop or idle — it never lingers in the background.
- The mic prefers the Windows-local engine and falls back to the browser's Web
  Speech where the bridge is unavailable.
- Clear, actionable error messages when the Windows speech-privacy gate blocks
  recognition (e.g. "语音语音隐私未授权…"), instead of a silent failure.

## [0.1.1] - 2026-08-27

### Fixed

- Stop and start no longer leave the composer input locked: start/stop watchdog
  timeouts (10 s / 2.5 s) force a clean finish when the browser never emits
  `onstart` or `onend`, and `stop()` before the recognizer starts now aborts
  and settles immediately.
- Final recognition results delivered after `stop()` are retained instead of
  being dropped.

## [0.1.0] - 2026-08-22

### Added

- Localized, accessible voice-input control in the official composer slot.
- Live local RMS microphone meter with a 24-segment waveform history.
- Chinese and English interface copy, tests, and release documentation.

[0.2.1]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.2.1
[0.2.0]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.2.0
[0.1.9]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.9
[0.1.8]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.8
[0.1.7]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.7
[0.1.6]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.6
[0.1.5]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.5
[0.1.4]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.4
[0.1.3]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.3
[0.1.2]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.2
[0.1.1]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.1
[0.1.0]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.0