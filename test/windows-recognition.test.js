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

async function tick(ms = 0) { await new Promise(r => setTimeout(r, ms)) }

describe('WindowsBridgeRecognition (single-shot, same-origin host)', () => {
  it('fires onstart synchronously and emits the returned text as a final result', async () => {
    const rec = new WindowsBridgeRecognition({
      fetchImpl: fakeFetch({
        '/dsh-speech-input/bridge/start': () => ({ text: '你好世界', error: null }),
        '/dsh-speech-input/bridge/stop': () => ({ text: '你好世界', final: true }),
      }),
      sleep: () => Promise.resolve(),
    })
    const states = []
    const results = []
    rec.onstart = () => states.push('start')
    rec.onend = () => states.push('end')
    rec.onresult = evt => results.push(evt.results[0][0].transcript)

    rec.start()
    assert.equal(states.includes('start'), true)
    await tick(10)
    assert.equal(results.at(-1), '你好世界')
    await tick(10)
    assert.equal(states.at(-1), 'end')
  })

  it('surfaces a start error and does not emit text', async () => {
    const rec = new WindowsBridgeRecognition({
      fetchImpl: fakeFetch({
        '/dsh-speech-input/bridge/start': () => ({ text: '', error: 'privacy-policy-not-accepted' }),
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

  it('stop fires onend even without an active session', () => {
    const rec = new WindowsBridgeRecognition({})
    let ended = false
    rec.onend = () => { ended = true }
    rec.stop()
    assert.equal(ended, true)
  })

  it('abort fires onend without error', () => {
    const rec = new WindowsBridgeRecognition({})
    let ended = false
    rec.onend = () => { ended = true }
    rec.abort()
    assert.equal(ended, true)
  })
})
