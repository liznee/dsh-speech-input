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
      schedule: () => {},
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

  it('keeps the recognizer alive long enough to commit a final result delivered after stop', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    recognition.stop = function stop() { this.stopCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    controller.stop()
    recognition.result([speechResult('发送这段话', true)])
    recognition.end()

    assert.equal(draft, '发送这段话。')
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

  it('cancels only the current voice transcript and aborts recognition', () => {
    let draft = '已有草稿'
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: () => {},
      language: () => 'zh-CN',
      punctuation: () => 'keep',
    })

    controller.start()
    recognition.result([speechResult('语音内容')])
    assert.equal(draft, '已有草稿语音内容')
    draft += '手工追加'

    controller.cancel()
    assert.equal(draft, '已有草稿手工追加')
    assert.equal(recognition.abortCalls, 1)
  })

  it('finishes immediately when stop lands before the recognizer has started', () => {
    let draft = ''
    const states = []
    const recognition = new FakeRecognition()
    recognition.start = function start() { this.startCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: () => {},
    })

    controller.start()
    assert.equal(states.at(-1).phase, 'starting')
    controller.stop()

    assert.equal(states.at(-1).phase, 'idle')
    assert.equal(recognition.abortCalls, 1)
    assert.equal(recognition.stopCalls, 0)
  })

  it('recovers via watchdog when the browser never ends a stopped recognition', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    recognition.stop = function stop() { this.stopCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    recognition.result([speechResult('发送这段话')])
    controller.stop()
    assert.equal(states.at(-1).phase, 'stopping')
    assert.equal(scheduled.length, 1)

    scheduled.shift()()

    assert.equal(states.at(-1).phase, 'idle')
    assert.equal(draft, '发送这段话。')
    assert.equal(recognition.abortCalls, 1)
  })

  it('fails to an error state when the recognizer never signals start', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    recognition.start = function start() { this.startCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    assert.equal(states.at(-1).phase, 'starting')
    assert.equal(scheduled.length, 1)

    scheduled.shift()()

    assert.equal(states.at(-1).phase, 'error')
    assert.equal(states.at(-1).reason, 'start-failed')
    assert.equal(recognition.abortCalls, 1)
  })

  it('recovers when a restarted recognizer never signals start', () => {
    const recognitions = []
    const scheduled = []
    const phases = []
    const silent = new FakeRecognition()
    silent.start = function start() { this.startCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => {
        const recognition = recognitions.length === 0 ? new FakeRecognition() : silent
        recognitions.push(recognition)
        return recognition
      },
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { phases.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    recognitions.at(-1).end()
    // 静默结束后的重开回调
    assert.equal(scheduled.length, 1)
    scheduled.shift()()
    assert.equal(recognitions.length, 2)
    assert.equal(phases.at(-1).phase, 'starting')
    // 重开的识别器永不触发 onstart：启动看门狗应兜底
    assert.equal(scheduled.length, 1)

    scheduled.shift()()

    assert.equal(phases.at(-1).phase, 'error')
    assert.equal(phases.at(-1).reason, 'start-failed')
    assert.equal(silent.abortCalls, 1)
  })

  it('ignores watchdog ticks after a normal stop has already settled', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    recognition.result([speechResult('正常结束')])
    controller.stop()
    assert.equal(states.at(-1), 'idle')
    assert.equal(draft, '正常结束。')
    assert.equal(scheduled.length, 1)

    scheduled.shift()()

    assert.equal(states.at(-1), 'idle')
    assert.equal(draft, '正常结束。')
    assert.equal(recognition.abortCalls, 0)
  })

  it('ignores a stale start watchdog after stop settles first', () => {
    const states = []
    const scheduled = []
    const recognition = new FakeRecognition()
    recognition.start = function start() { this.startCalls += 1 }
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    assert.equal(scheduled.length, 1)
    controller.stop()
    assert.equal(states.at(-1).phase, 'idle')

    scheduled.shift()()

    assert.equal(states.at(-1).phase, 'idle')
    assert.equal(states.some(state => state.phase === 'error'), false)
  })

  it('retains committed rounds when stopping during a silent restart gap', () => {
    let draft = ''
    const states = []
    const scheduled = []
    const recognitions = []
    const controller = new VoiceRecognitionController({
      createRecognition: () => {
        const recognition = new FakeRecognition()
        recognitions.push(recognition)
        return recognition
      },
      getDraft: () => draft,
      setDraft: value => { draft = value },
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'smart',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    const recognition = recognitions.at(-1)
    recognition.result([speechResult('已提交轮次')])
    recognition.end()
    assert.equal(states.at(-1).phase, 'starting')

    controller.stop()

    assert.equal(states.at(-1).phase, 'idle')
    assert.equal(draft, '已提交轮次。')
    // 遗留的重开回调不应再创建识别器
    scheduled.shift()()
    assert.equal(recognitions.length, 1)
  })
})
