# Changelog

All notable changes to this project are documented in this file.

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

[0.1.1]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.1
[0.1.0]: https://github.com/liznee/dsh-speech-input/releases/tag/v0.1.0