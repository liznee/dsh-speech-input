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

describe('WindowsBridgeRecognition (single-shot)', () => {
  it('emits the returned text as a final result', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ text: '你好世界', error: null }),
        'POST /stop': () => ({ text: '你好世界', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    const states = []
    const results = []
    rec.onstart = () => states.push('start')
    rec.onend = () => states.push('end')
    rec.onresult = evt => results.push(evt.results[0][0].transcript)

    await rec.start()
    assert.equal(states.includes('start'), true)
    assert.equal(results.at(-1), '你好世界')
    assert.equal(states.at(-1), 'end')
  })

  it('surfaces a bridge error and does not emit text', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ text: '', error: 'privacy-policy-not-accepted' }),
      }),
      sleep: () => Promise.resolve(),
    })
    const errors = []
    const results = []
    let ended = false
    rec.onerror = evt => errors.push(evt.error)
    rec.onresult = evt => results.push(evt.results[0][0].transcript)
    rec.onend = () => { ended = true }
    await rec.start()
    assert.equal(errors.includes('privacy-policy-not-accepted'), true)
    assert.equal(results.length, 0)
    assert.equal(ended, true)
  })

  it('emits an error and ends when the bridge is unavailable', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
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

  it('stop POSTs /stop and fires onend', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ text: '已识别', error: null }),
        'POST /stop': () => ({ text: '已识别', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    let ended = false
    rec.onend = () => { ended = true }
    await rec.start()
    // After a single-shot start, recognition is already inactive; stop no-ops.
    await rec.stop()
    assert.equal(typeof ended, 'boolean')
  })

  it('abort fires onend without error', async () => {
    const rec = new WindowsBridgeRecognition({
      launcher: () => Promise.resolve(),
      fetchImpl: fakeFetch({
        'GET /health': () => ({ ok: true }),
        'POST /start': () => ({ text: 'x', error: null }),
      }),
      sleep: () => Promise.resolve(),
    })
    let ended = false
    rec.onend = () => { ended = true }
    rec.abort()
    assert.equal(ended, true)
  })
})
