import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WindowsBridgeRecognition } from '../src/windows-recognition.js'

function fakeFetch(routes) {
  return async (url, options) => {
    const path = new URL(url).pathname
    const method = options?.method ?? 'GET'
    const handler = routes[`${method} ${path}`] ?? routes[path]
    if (!handler) throw new Error(`no route for ${method} ${path}`)
    if (handler instanceof Error) throw handler
    const body = typeof handler === 'function' ? handler() : handler
    return { ok: true, status: 200, async json() { return body } }
  }
}

// A tiny fake interval controller so tests don't actually poll.
function capturePoller() {
  const intervals = []
  return {
    intervals,
    setIntervalImpl: fn => {
      const id = { fn, active: true }
      intervals.push(id)
      return id
    },
    clearIntervalImpl: id => { if (id) id.active = false },
  }
}

async function flush(ms = 20) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('WindowsBridgeRecognition', () => {
  it('drives onstart then streams onresult text through polling', async () => {
    const poller = capturePoller()
    let startBody = { started: true }
    let text = '你好世界'
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true, started: true }),
        'POST /start': () => startBody,
        'GET /result': () => ({ text, final: false }),
        'POST /stop': () => ({ text: '你好世界。', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    // Patch interval to avoid real polling.
    globalThis.setInterval = poller.setIntervalImpl
    globalThis.clearInterval = poller.clearIntervalImpl

    const states = []
    const results = []
    rec.onstart = () => states.push('start')
    rec.onend = () => states.push('end')
    rec.onresult = evt => results.push(evt.results[0][0].transcript)

    await rec.start()
    assert.equal(states.includes('start'), true)

    // Manually tick the poller once.
    const id = poller.intervals[0]
    assert.ok(id, 'expected a poller interval')
    await id.fn()
    assert.equal(results.at(-1), '你好世界')

    await rec.stop()
    assert.equal(results.at(-1), '你好世界。')
    assert.equal(states.at(-1), 'end')

    globalThis.setInterval = undefined
    globalThis.clearInterval = undefined
  })

  it('emits an error and ends if the bridge never becomes available', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.reject(new Error('no')),
      fetchImpl: async () => { throw new Error('down') },
      sleep: () => Promise.resolve(),
      maxStartAttempts: 2,
    })
    const errors = []
    let ended = false
    rec.onerror = evt => errors.push(evt.error)
    rec.onend = () => { ended = true }
    await rec.start()
    assert.equal(errors.includes('bridge-unavailable'), true)
    assert.equal(ended, true)
  })

  it('surfaces the bridge start error when privacy is not accepted', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ started: false, error: 'privacy-policy-not-accepted' }),
      }),
      sleep: () => Promise.resolve(),
    })
    const errors = []
    let started = false
    let ended = false
    rec.onerror = evt => errors.push(evt.error)
    rec.onstart = () => { started = true }
    rec.onend = () => { ended = true }
    await rec.start()
    assert.equal(errors.includes('privacy-policy-not-accepted'), true)
    assert.equal(started, false)
    assert.equal(ended, true)
  })

  it('abort clears the poller and fires onend', async () => {
    const poller = capturePoller()
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ started: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    globalThis.setInterval = poller.setIntervalImpl
    globalThis.clearInterval = poller.clearIntervalImpl
    let ended = false
    rec.onend = () => { ended = true }
    await rec.start()
    assert.ok(poller.intervals.length >= 1)
    rec.abort()
    assert.equal(ended, true)
    assert.equal(poller.intervals[0].active, false)
    globalThis.setInterval = undefined
    globalThis.clearInterval = undefined
  })
})
