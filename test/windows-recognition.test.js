import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WindowsBridgeRecognition } from '../src/windows-recognition.js'

function fakeFetch(routes) {
  return async (url, options) => {
    const handler = routes[url] ?? routes[`${options?.method} ${url}`]
    if (!handler) throw new Error(`no route for ${url}`)
    if (handler instanceof Error) throw handler
    const body = typeof handler === 'function' ? handler() : handler
    return { ok: true, status: 200, async json() { return body } }
  }
}

function capturePoller() {
  const intervals = []
  return {
    intervals,
    setIntervalImpl: fn => { const id = { fn, active: true }; intervals.push(id); return id },
    clearIntervalImpl: id => { if (id) id.active = false },
  }
}

async function tick(ms = 0) { await new Promise(r => setTimeout(r, ms)) }

describe('WindowsBridgeRecognition (continuous, same-origin host)', () => {
  it('fires onstart synchronously and streams text via polling', async () => {
    const poller = capturePoller()
    let resultCount = 0
    const rec = new WindowsBridgeRecognition({
      fetchImpl: fakeFetch({
        '/dsh-speech-input/bridge/start': () => ({ started: true, error: null }),
        '/dsh-speech-input/bridge/result': () => ({ text: '你好世界', error: null, running: true }),
        '/dsh-speech-input/bridge/stop': () => ({ text: '你好世界', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    globalThis.setInterval = poller.setIntervalImpl
    globalThis.clearInterval = poller.clearIntervalImpl
    const states = []
    const results = []
    rec.onstart = () => states.push('start')
    rec.onend = () => states.push('end')
    rec.onresult = evt => { results.push(evt.results[0][0].transcript); resultCount += 1 }

    rec.start()
    assert.equal(states.includes('start'), true)
    await tick(10)
    assert.ok(poller.intervals.length >= 1, 'expected a poller interval')
    await poller.intervals[0].fn()
    await tick(5)
    assert.equal(results.includes('你好世界'), true)
    rec.stop()
    assert.equal(states.at(-1), 'end')

    globalThis.setInterval = undefined
    globalThis.clearInterval = undefined
  })

  it('surfaces a start error and does not emit text', async () => {
    const rec = new WindowsBridgeRecognition({
      fetchImpl: fakeFetch({
        '/dsh-speech-input/bridge/start': () => ({ started: false, error: 'privacy-policy-not-accepted' }),
      }),
      sleep: () => Promise.resolve(),
    })
    const errors = []
    const results = []
    let ended = false
    rec.onerror = evt => errors.push(evt.error)
    rec.onresult = evt => results.push(evt.results[0][0].transcript)
    rec.onend = () => { ended = true }
    rec.start()
    await tick(10)
    assert.equal(errors.includes('privacy-policy-not-accepted'), true)
    assert.equal(results.length, 0)
    assert.equal(ended, true)
  })

  it('emits an error and ends when the bridge is unavailable', async () => {
    const rec = new WindowsBridgeRecognition({
      fetchImpl: async () => { throw new Error('down') },
      sleep: () => Promise.resolve(),
    })
    const errors = []
    let ended = false
    rec.onerror = evt => errors.push(evt.error)
    rec.onend = () => { ended = true }
    rec.start()
    await tick(10)
    assert.equal(errors.includes('start-failed'), true)
    assert.equal(ended, true)
  })

  it('stop clears the poller and fires onend', async () => {
    const poller = capturePoller()
    const rec = new WindowsBridgeRecognition({
      fetchImpl: fakeFetch({
        '/dsh-speech-input/bridge/start': () => ({ started: true, error: null }),
        '/dsh-speech-input/bridge/result': () => ({ text: '', error: null }),
        '/dsh-speech-input/bridge/stop': () => ({ text: '', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    globalThis.setInterval = poller.setIntervalImpl
    globalThis.clearInterval = poller.clearIntervalImpl
    const states = []
    rec.onstart = () => states.push('start')
    rec.onend = () => states.push('end')
    rec.start()
    await tick(10)
    rec.stop()
    assert.equal(states.at(-1), 'end')
    assert.equal(poller.intervals.every(i => !i.active), true)
    globalThis.setInterval = undefined
    globalThis.clearInterval = undefined
  })

  it('abort fires onend without error', () => {
    const rec = new WindowsBridgeRecognition({})
    let ended = false
    rec.onend = () => { ended = true }
    rec.abort()
    assert.equal(ended, true)
  })
})
