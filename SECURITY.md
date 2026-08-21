# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository rather
than opening a public issue. Include reproduction steps, affected versions,
and the expected impact. Please do not include real credentials or private
audio in a report.

## Data handling

The plugin does not store audio or send it to Harness or DeepSeek. Its local
volume meter connects a microphone stream only to a Web Audio `AnalyserNode`
and releases every track on stop, cancel, error, or teardown. Browser speech
recognition may send audio to the browser vendor; see the README privacy notice.
