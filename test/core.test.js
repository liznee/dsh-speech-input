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
})

describe('silence auto-stop', () => {
  function fakeClock() {
    let value = 1_000_000
    return { now: () => value, advance: ms => { value += ms } }
  }

  it('schedules no silence timer when silenceTimeoutMs is not configured', () => {
    const scheduled = []
    const controller = new VoiceRecognitionController({
      createRecognition: () => new FakeRecognition(),
      getDraft: () => '',
      setDraft: () => {},
      onState: () => {},
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
    })

    controller.start()
    assert.equal(scheduled.length, 0)
    controller.stop()
  })

  it('auto-stops after the silence timeout even without any speech', () => {
    const clock = fakeClock()
    const scheduled = []
    const states = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { states.push(state) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
      now: clock.now,
      silenceTimeoutMs: 500,
    })

    assert.equal(controller.start(), true)
    assert.equal(scheduled.length, 1)
    assert.equal(states.some(state => state.phase === 'idle'), false)

    clock.advance(500)
    scheduled.shift()()

    assert.equal(recognition.stopCalls, 1)
    assert.equal(states.at(-1).phase, 'idle')
    assert.equal(states.at(-1).reason, 'silence')
  })

  it('resets the deadline while speech arrives and auto-stops after full silence', () => {
    const clock = fakeClock()
    const scheduled = []
    const phases = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { phases.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
      now: clock.now,
      silenceTimeoutMs: 500,
    })

    controller.start()
    assert.equal(scheduled.length, 1)

    // A stale timer armed before speech must not stop the controller.
    const stale = scheduled.shift()
    clock.advance(300)
    recognition.result([speechResult('查天气')])
    stale()
    assert.equal(phases.includes('idle'), false)
    assert.equal(recognition.stopCalls, 0)

    // 300 ms of silence after speech is not yet the full 500 ms deadline.
    assert.equal(scheduled.length, 1)
    clock.advance(300)
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 0)
    assert.equal(phases.includes('idle'), false)

    // Reaching the deadline anchored to the latest speech stops it.
    clock.advance(200)
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 1)
    assert.equal(phases.at(-1), 'idle')
  })

  it('does not reset the deadline when the engine re-emits identical results', () => {
    const clock = fakeClock()
    const scheduled = []
    const phases = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: state => { phases.push(state.phase) },
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
      now: clock.now,
      silenceTimeoutMs: 500,
    })

    controller.start()
    assert.equal(scheduled.length, 1) // deadline at t0 + 500

    clock.advance(100)
    recognition.result([speechResult('你好', true)]) // real speech → t0+100 + 500
    assert.equal(scheduled.length, 2)

    clock.advance(100)
    recognition.result([speechResult('你好', true)]) // identical re-emit: no reset
    assert.equal(scheduled.length, 3)

    // Stale timers are inert; the deadline must stay anchored to the speech.
    scheduled.shift()()
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 0)

    clock.advance(300) // t0+500: 400 ms of silence, 100 ms to go
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 0)

    clock.advance(200) // t0+700: past the t0+600 deadline
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 1)
    assert.equal(phases.at(-1), 'idle')
  })

  it('ignores ambient onspeechstart noise when deciding silence', () => {
    const clock = fakeClock()
    const scheduled = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: () => {},
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
      now: clock.now,
      silenceTimeoutMs: 500,
    })

    controller.start()
    assert.equal(scheduled.length, 1) // deadline at t0 + 500

    clock.advance(400)
    recognition.onspeechstart?.() // noise spike must not extend the deadline
    assert.equal(scheduled.length, 1)

    clock.advance(100)
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 1)
  })

  it('invalidates pending silence timers after an explicit stop', () => {
    const clock = fakeClock()
    const scheduled = []
    const recognition = new FakeRecognition()
    const controller = new VoiceRecognitionController({
      createRecognition: () => recognition,
      getDraft: () => '',
      setDraft: () => {},
      onState: () => {},
      language: () => 'zh-CN',
      punctuation: () => 'keep',
      schedule: fn => { scheduled.push(fn) },
      now: clock.now,
      silenceTimeoutMs: 500,
    })

    controller.start()
    assert.equal(scheduled.length, 1)
    controller.stop()
    assert.equal(recognition.stopCalls, 1)

    // A stale timer firing long after the user stopped must not stop twice.
    clock.advance(10_000)
    scheduled.shift()()
    assert.equal(recognition.stopCalls, 1)
  })
})
