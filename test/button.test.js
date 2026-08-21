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

  speechStart() {
    this.onspeechstart?.()
  }

  speechEnd() {
    this.onspeechend?.()
  }
}

const translate = key => key
const buttonByLabel = (view, label) => view.root.findAllByType('button')
  .find(button => button.props['aria-label'] === label)
const waveform = view => view.root.find(node => node.props.className === 'dsh-speech-input-waveform')

afterEach(() => {
  delete globalThis.window
  FakeRecognition.latest = null
})

describe('SpeechInputButton', () => {
  it('dictates into a live draft, toggles state, and never submits', () => {
    globalThis.window = { SpeechRecognition: FakeRecognition }
    let latestDraft = ''
    let submitCalls = 0
    const composerBlocks = []

    function Harness() {
      const [draft, setDraft] = React.useState('请帮我')
      latestDraft = draft
      return React.createElement(SpeechInputButton, {
        input: { draft, phase: 'plain' },
        inputActions: {
          setDraft,
          submit: () => { submitCalls += 1 },
        },
        setComposerBlocked: block => { composerBlocks.push(block) },
        t: translate,
      })
    }

    let view
    act(() => { view = TestRenderer.create(React.createElement(Harness)) })
    let button = view.root.findByType('button')
    assert.equal(button.props['aria-label'], 'start')

    act(() => { button.props.onClick() })
    button = buttonByLabel(view, 'stop')
    assert.equal(button.props['aria-pressed'], true)
    assert.equal(view.root.findAllByType('rect').length, 1)
    assert.equal(buttonByLabel(view, 'cancel') !== undefined, true)
    assert.deepEqual(composerBlocks.at(-1), { reason: 'listening-block' })
    assert.equal(waveform(view).props['data-speaking'], 'false')
    assert.equal(typeof FakeRecognition.latest.lang, 'string')
    assert.notEqual(FakeRecognition.latest.lang, '')

    act(() => { FakeRecognition.latest.speechStart() })
    assert.equal(waveform(view).props['data-speaking'], 'true')
    act(() => { FakeRecognition.latest.speechEnd() })
    assert.equal(waveform(view).props['data-speaking'], 'false')

    act(() => { FakeRecognition.latest.result('查天气') })
    assert.equal(latestDraft, '请帮我查天气')

    act(() => { buttonByLabel(view, 'stop').props.onClick() })
    assert.equal(latestDraft, '请帮我查天气。')
    assert.equal(FakeRecognition.latest.stopCalls, 1)
    assert.equal(submitCalls, 0)
    assert.equal(composerBlocks.at(-1), undefined)

    act(() => { view.unmount() })
  })

  it('surfaces a permission error and releases an active recognizer on unmount', () => {
    globalThis.window = { webkitSpeechRecognition: FakeRecognition }
    const props = {
      input: { draft: '', phase: 'plain' },
      inputActions: { setDraft: () => {} },
      setComposerBlocked: () => {},
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
        setComposerBlocked: () => {},
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
        setComposerBlocked: () => {},
        t: translate,
      }))
    })
    assert.equal(view.root.findByType('button').props.disabled, true)
    assert.equal(view.root.findByType('button').props.title, 'busy')
    act(() => { view.unmount() })
  })

  it('cancels the current dictation from the visible X control', () => {
    globalThis.window = { SpeechRecognition: FakeRecognition }
    let latestDraft = ''

    function Harness() {
      const [draft, setDraft] = React.useState('原文')
      latestDraft = draft
      return React.createElement(SpeechInputButton, {
        input: { draft, phase: 'plain' },
        inputActions: { setDraft },
        setComposerBlocked: () => {},
        t: translate,
      })
    }

    let view
    act(() => { view = TestRenderer.create(React.createElement(Harness)) })
    act(() => { view.root.findByType('button').props.onClick() })
    act(() => { FakeRecognition.latest.result('语音') })
    assert.equal(latestDraft, '原文语音')

    act(() => { buttonByLabel(view, 'cancel').props.onClick() })
    assert.equal(latestDraft, '原文')
    assert.equal(FakeRecognition.latest.abortCalls, 1)
    act(() => { view.unmount() })
  })
})
