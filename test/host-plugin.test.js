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

  it('registers recognize/stop/status/start routes when webServer is available', async () => {
    const ctx = await makeCtx()
    await apply(ctx)
    const paths = ctx.routes.map(r => r.path)
    assert.deepEqual(paths, [
      '/dsh-speech-input/bridge/recognize',
      '/dsh-speech-input/bridge/stop',
      '/dsh-speech-input/bridge/status',
      '/dsh-speech-input/bridge/start',
    ])
    assert.equal(ctx.routes.every(r => r.kind === 'exact'), true)
    assert.equal(typeof ctx.routes[0].handler, 'function')
    const recognizeHandler = ctx.routes.find(r => r.path === '/dsh-speech-input/bridge/recognize').handler
    assert.equal(typeof recognizeHandler, 'function')
  })

  it('installs a bridge-runtime effect when webServer is available', async () => {
    const ctx = await makeCtx()
    await apply(ctx)
    assert.equal(ctx.effects.some(e => e.label.includes('bridge runtime')), true)
    assert.equal(ctx.effects.some(e => e.label.includes('bridge lifecycle')), false)
  })
})
