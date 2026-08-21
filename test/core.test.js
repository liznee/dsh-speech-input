import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  VoiceRecognitionController,
  applyPunctuation,
  joinDraft,
  mergeRecognitionDraft,
} from '../src/core.js'

function speechResult(transcript, isFinal = false) {
  const result = [{ transcript }]
  result.isFinal = isFinal
  return result
}

class FakeRecognition {
  continuous = false
  interimResults = false
  lang = ''
  startCalls = 0
  stopCalls = 0
  abortCalls = 0

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

  result(results) {
    this.onresult?.({ resultIndex: 0, results })
  }

  error(error) {
    this.onerror?.({ error })
  }

  end() {
    this.onend?.()
  }
}

describe('draft composition', () => {
  it('joins Chinese without an artificial space and English with one', () => {
    assert.equal(joinDraft('请帮我', '查天气'), '请帮我查天气')
    assert.equal(joinDraft('Please', 'check the weather'), 'Please check the weather')
  })

  it('replaces changing interim text without duplicating it', () => {
    const first = mergeRecognitionDraft('请帮我', '请帮我', '', '查天气')
    assert.equal(first, '请帮我查天气')
    assert.equal(
      mergeRecognitionDraft(first, '请帮我', '查天气', '查一下天气'),
      '请帮我查一下天气',
    )
  })

  it('preserves text typed after the current recognition text', () => {
    assert.equal(
      mergeRecognitionDraft('请帮我查天气谢谢', '请帮我', '查天气', '查明天天气'),
      '请帮我查明天天气谢谢',
    )
  })

  it('removes punctuation without deleting Chinese characters', () => {
    assert.equal(applyPunctuation('第一，第二。', 'none'), '第一第二')
    assert.equal(applyPunctuation('今天天气好吗', 'smart'), '今天天气好吗？')
  })
})

describe('VoiceRecognitionController', () => {
  it('streams interim text into the draft and punctuates on explicit stop', () => {
    let draft = '请帮我'
    const states = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
    })

    assert.equal(controller.start(), true)
    assert.equal(recognition.lang, 'zh-CN')
    assert.equal(recognition.continuous, true)
    assert.equal(recognition.interimResults, true)

    recognition.result([speechResult('查天气')])
    assert.equal(draft, '请帮我查天气')
    recognition.result([speechResult('查一下天气')])
    assert.equal(draft, '请帮我查一下天气')

    controller.stop()
    assert.equal(draft, '请帮我查一下天气。')
    assert.equal(recognition.stopCalls, 1)
    assert.equal(states.at(-1), 'idle')
  })

  it('reports denied microphone permission and does not restart', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    recognition.error('not-allowed')
    recognition.end()

    assert.equal(states.at(-1).phase, 'error')
    assert.equal(states.at(-1).reason, 'permission-denied')
    assert.equal(scheduled.length, 0)
  })

  it('aborts recognition during teardown', () => {
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: () => {},
      language: () => 'en-US',
      punctuation: () => 'keep',
    })

    controller.start()
    controller.destroy()
    assert.equal(recognition.abortCalls, 1)
  })

  it('restarts after any number of silent ends until the user stops it', () => {
    const recognitions = []
    const scheduled = []
    const phases = []
    const controller = new VoiceRecognitionController({
      createRecognition: () => {
        const recognition = new FakeRecognition()
        recognitions.push(recognition)
        return recognition
      },
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { phases.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    for (let count = 0; count < 8; count += 1) {
      recognitions.at(-1).end()
      assert.equal(scheduled.length, 1)
      scheduled.shift()()
    }

    assert.equal(recognitions.length, 9)
    assert.equal(phases.includes('idle'), false)
    controller.stop()
    assert.equal(phases.at(-1), 'idle')
  })
})
