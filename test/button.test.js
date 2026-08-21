import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { SpeechInputButton } from '../src/client/index.js'

class FakeRecognition {
  startCalls = 0
  stopCalls = 0
  abortCalls = 0

  constructor() {
    FakeRecognition.latest = this
  }

  start() {
    this.startCalls += 1
    this.onstart?.()
  }

  stop() {
    this.stopCalls += 1
    this.onend?.()
  }

  abort() {
    this.abortCalls += 1
    this.onend?.()
  }

  result(transcript, isFinal = false) {
    const result = [{ transcript }]
    result.isFinal = isFinal
    this.onresult?.({ resultIndex: 0, results: [result] })
  }

  error(error) {
    this.onerror?.({ error })
  }
}

const translate = key => key

afterEach(() => {
  delete globalThis.window
  FakeRecognition.latest = null
})

describe('SpeechInputButton', () => {
  it('dictates into a live draft, toggles state, and never submits', () => {
    globalThis.window = { SpeechRecognition: FakeRecognition }
    let latestDraft = ''
    let submitCalls = 0

    function Harness() {
      const [draft, setDraft] = React.useState('请帮我')
      latestDraft = draft
      return React.createElement(SpeechInputButton, {
        input: { draft, phase: 'plain' },
        inputActions: {
          setDraft,
          submit: () => { submitCalls += 1 },
        },
        t: translate,
      })
    }

    let view
    act(() => { view = TestRenderer.create(React.createElement(Harness)) })
    let button = view.root.findByType('button')
    assert.equal(button.props['aria-label'], 'start')

    act(() => { button.props.onClick() })
    button = view.root.findByType('button')
    assert.equal(button.props['aria-pressed'], true)
    assert.equal(typeof FakeRecognition.latest.lang, 'string')
    assert.notEqual(FakeRecognition.latest.lang, '')

    act(() => { FakeRecognition.latest.result('查天气') })
    assert.equal(latestDraft, '请帮我查天气')

    act(() => { view.root.findByType('button').props.onClick() })
    assert.equal(latestDraft, '请帮我查天气。')
    assert.equal(FakeRecognition.latest.stopCalls, 1)
    assert.equal(submitCalls, 0)

    act(() => { view.unmount() })
  })

  it('surfaces a permission error and releases an active recognizer on unmount', () => {
    globalThis.window = { webkitSpeechRecognition: FakeRecognition }
    const props = {
      input: { draft: '', phase: 'plain' },
      inputActions: { setDraft: () => {} },
      t: translate,
    }
    let view
    act(() => { view = TestRenderer.create(React.createElement(SpeechInputButton, props)) })
    act(() => { view.root.findByType('button').props.onClick() })
    const denied = FakeRecognition.latest
    act(() => { denied.error('not-allowed') })
    assert.equal(view.root.findByType('button').props['data-error'], 'true')
    assert.equal(view.root.findByType('button').props.title, 'permission-denied')

    act(() => { view.root.findByType('button').props.onClick() })
    const active = FakeRecognition.latest
    act(() => { view.unmount() })
    assert.equal(active.abortCalls, 1)
  })

  it('is disabled in unsupported browsers and while the input is busy', () => {
    globalThis.window = {}
    let view
    act(() => {
      view = TestRenderer.create(React.createElement(SpeechInputButton, {
        input: { draft: '', phase: 'plain' },
        inputActions: { setDraft: () => {} },
        t: translate,
      }))
    })
    assert.equal(view.root.findByType('button').props.disabled, true)
    assert.equal(view.root.findByType('button').props.title, 'unsupported')
    act(() => { view.unmount() })

    globalThis.window = { SpeechRecognition: FakeRecognition }
    act(() => {
      view = TestRenderer.create(React.createElement(SpeechInputButton, {
        input: { draft: '', phase: 'submitting' },
        inputActions: { setDraft: () => {} },
        t: translate,
      }))
    })
    assert.equal(view.root.findByType('button').props.disabled, true)
    assert.equal(view.root.findByType('button').props.title, 'busy')
    act(() => { view.unmount() })
  })
})
