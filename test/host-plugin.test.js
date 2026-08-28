import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../src/index.js'

function makeCtx() {
  const routes = []
  const effects = []
  return {
    routes,
    effects,
    get(key) {
      if (key === 'webServer') {
        return {
          register(route) {
            routes.push(route)
            return () => {}
          },
        }
      }
      return undefined
    },
    effect(fn, label) {
      effects.push({ fn, label })
      return () => {}
    },
  }
}

describe('host plugin bridge routes', () => {
  it('registers /start, /stop, /status routes when webServer is available', () => {
    const ctx = makeCtx()
    apply(ctx)
    const paths = ctx.routes.map(r => r.path)
    assert.deepEqual(paths, [
      '/dsh-speech-input/bridge/start',
      '/dsh-speech-input/bridge/stop',
      '/dsh-speech-input/bridge/status',
    ])
    assert.equal(ctx.routes.every(r => r.kind === 'exact'), true)
    assert.equal(typeof ctx.routes[0].handler, 'function')
  })

  it('no-ops when webServer is unavailable', () => {
    const ctx = makeCtx()
    ctx.get = () => undefined
    let threw = false
    try { apply(ctx) } catch { threw = true }
    assert.equal(threw, false)
    assert.equal(ctx.routes.length, 0)
  })

  it('installs a bridge-lifecycle disposal effect when webServer is available', () => {
    const ctx = makeCtx()
    apply(ctx)
    assert.equal(ctx.effects.some(e => e.label.includes('bridge lifecycle')), true)
  })
})
