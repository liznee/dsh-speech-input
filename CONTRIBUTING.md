# Contributing

Issues and focused pull requests are welcome. Please keep changes scoped to the
DeepSeek Harness voice-input plugin and preserve its privacy guarantees.

## Development

Node.js 20 or newer is required.

```sh
npm ci
npm test
npm run test:coverage
npm run pack:check
```

Behavior changes should include a failing test first. Do not add analytics,
audio storage, automatic message submission, or credentials to the project.
Microphone tracks must be released on stop, cancel, error, and teardown.

By submitting a contribution, you agree that it is licensed under the MIT
License included in this repository.
