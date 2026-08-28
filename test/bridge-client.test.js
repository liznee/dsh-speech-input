import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWindowsEngineBridge } from '../src/bridge-client.js'

function mockFetch(handler) {
  return async (url, options) => {
    const path = new URL(url).pathname
    const status = 200
    const body = handler(path, options?.method ?? 'GET', options?.body)
    return {
      ok: status < 400,
      status,
      async json() { return body },
    }
  }
}

const ok = obj => obj

describe('createWindowsEngineBridge', () => {
  it('health returns alive=true when the bridge responds', async () => {
    const bridge = createWindowsEngineBridge({
      fetchImpl: mockFetch(() => ok({ ok: true, started: false })),
    })
    assert.equal(await bridge.isAlive(), true)
  })

  it('health returns false when the bridge is unreachable', async () => {
    const bridge = createWindowsEngineBridge({
      fetchImpl: async () => { throw new Error('ECONNREFUSED') },
    })
    assert.equal(await bridge.isAlive(), false)
  })

  it('start calls launcher and POSTs /start once alive', async () => {
    let launcherCalls = 0
    const seen = []
    const bridge = createWindowsEngineBridge({
      fetchImpl: async (url, options) => {
        const path = new URL(url).pathname
        const method = options?.method ?? 'GET'
        seen.push(`${method} ${path}`)
        // First health probe fails (bridge not up yet) -> launcher starts it; second succeeds.
        if (path === '/health' && seen.filter(x => x === 'GET /health').length === 1) {
          throw new Error('ECONNREFUSED')
        }
        const body = path === '/health' ? ok({ ok: true, started: false }) : (path === '/start' ? ok({ started: true }) : ok({}))
        return { ok: true, status: 200, async json() { return body } }
      },
      sleep: () => Promise.resolve(),
    })
    const result = await bridge.start(() => { launcherCalls += 1 })
    assert.equal(result.started, true)
    assert.equal(launcherCalls, 1)
    assert.equal(seen.includes('GET /health'), true)
    assert.equal(seen.includes('POST /start'), true)
  })

  it('start retries via launcher until the bridge is alive', async () => {
    let launcherCalls = 0
    let alive = false
    const bridge = createWindowsEngineBridge({
      fetchImpl: async (url) => {
        const path = new URL(url).pathname
        if (path === '/health' && !alive) throw new Error('down')
        return { ok: true, status: 200, async json() { return { ok: true } } }
      },
      sleep: () => Promise.resolve(),
      maxStartAttempts: 5,
    })
    const promise = bridge.start(() => {
      launcherCalls += 1
      if (launcherCalls >= 2) alive = true
    })
    await promise
    assert.equal(launcherCalls, 2)
  })

  it('start throws when the bridge never becomes available', async () => {
    const bridge = createWindowsEngineBridge({
      fetchImpl: async () => { throw new Error('down') },
      sleep: () => Promise.resolve(),
      maxStartAttempts: 3,
    })
    await assert.rejects(() => bridge.start(() => {}), /bridge-unavailable/)
  })

  it('stop POSTs /stop and returns the final text', async () => {
    const bridge = createWindowsEngineBridge({
      fetchImpl: mockFetch((path, method) => {
        if (path === '/stop' && method === 'POST') return ok({ text: '已识别文本', final: true })
        return ok({})
      }),
      sleep: () => Promise.resolve(),
    })
    const result = await bridge.stop()
    assert.equal(result.text, '已识别文本')
    assert.equal(bridge.isStopped, true)
  })

  it('stop tolerates a dead bridge and returns empty text', async () => {
    const bridge = createWindowsEngineBridge({
      fetchImpl: async () => { throw new Error('down') },
      sleep: () => Promise.resolve(),
    })
    const result = await bridge.stop()
    assert.equal(result.text, '')
    assert.equal(bridge.isStopped, true)
  })
})
