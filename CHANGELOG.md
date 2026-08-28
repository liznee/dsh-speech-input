# Changelog

All notable changes to this project are documented in this file.

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

[0.1.6]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.6
[0.1.5]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.5
[0.1.4]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.4
[0.1.3]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.3
[0.1.2]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.2
[0.1.1]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.1
[0.1.0]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.0