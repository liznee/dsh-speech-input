import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, inject, name } from '../src/index.js'

async function makeCtx() {
  const routes = []
  const effects = []
  const ctx = {
    routes,
    effects,
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    async effect(fn, label) {
      effects.push({ label })
      // Run the async body so registrations happen; return its disposer.
      const disposer = await fn()
      return disposer
    },
  }
  return ctx
}

describe('host plugin bridge routes', () => {
  it('declares name and the webServer dependency', () => {
    assert.equal(name, 'dsh-speech-input')
    assert.equal(inject.includes('webServer'), true)
  })

  it('registers start/result/stop/status routes when webServer is available', async () => {
    const ctx = await makeCtx()
    await apply(ctx)
    const paths = ctx.routes.map(r => r.path)
    assert.deepEqual(paths, [
      '/dsh-speech-input/bridge/start',
      '/dsh-speech-input/bridge/result',
      '/dsh-speech-input/bridge/stop',
      '/dsh-speech-input/bridge/status',
    ])
    assert.equal(ctx.routes.every(r => r.kind === 'exact'), true)
    assert.equal(typeof ctx.routes[0].handler, 'function')
    const startHandler = ctx.routes.find(r => r.path === '/dsh-speech-input/bridge/start').handler
    assert.equal(typeof startHandler, 'function')
  })

  it('installs a bridge-runtime effect when webServer is available', async () => {
    const ctx = await makeCtx()
    await apply(ctx)
    assert.equal(ctx.effects.some(e => e.label.includes('bridge runtime')), true)
    assert.equal(ctx.effects.some(e => e.label.includes('bridge lifecycle')), false)
  })
})
