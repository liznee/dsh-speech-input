import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, en, zh } from '../src/client/index.js'

describe('client plugin registration', () => {
  it('registers localized copy and one microphone in the official composer slot', () => {
    const calls = { dictionaries: null, slot: null, blocks: [], currentBlock: undefined }
    const ctx = {
      effect(install) { return install() },
      locale: {
        register(namespace, dictionaries) {
          calls.dictionaries = { namespace, dictionaries }
          return () => {}
        },
      },
      conversation: {
        blocks: {
          set(sessionId, block) {
            calls.currentBlock = block
            calls.blocks.push({ sessionId, block })
          },
          storeFor() { return { getSnapshot: () => calls.currentBlock } },
        },
      },
      slots: {
        inject(name, install) {
          assert.equal(name, 'conversation.input.right')
          return install()
        },
        register(definition, component) {
          calls.slot = { definition, component }
          return () => {}
        },
      },
    }

    apply(ctx)

    assert.deepEqual(calls.dictionaries, {
      namespace: 'speech-input',
      dictionaries: { zh, en },
    })
    assert.equal(calls.slot.definition.name, 'conversation.input.right')
    assert.equal(calls.slot.definition.id, 'speech-input-microphone')
    assert.equal(calls.slot.definition.locale, 'speech-input')
    assert.equal(typeof calls.slot.definition.inject, 'function')
    assert.equal(typeof calls.slot.component, 'function')

    const injected = calls.slot.definition.inject('session-1')
    injected.setComposerBlocked({ reason: 'listening' })
    assert.deepEqual(calls.blocks.at(-1), {
      sessionId: 'session-1',
      block: { reason: 'listening' },
    })
    injected.setComposerBlocked(undefined)
    assert.deepEqual(calls.blocks.at(-1), { sessionId: 'session-1', block: undefined })
  })

  it('keeps Chinese and English dictionaries key-compatible', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  })
})
