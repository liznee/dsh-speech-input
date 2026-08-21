import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MicrophoneLevelMeter } from '../src/audio-level.js'

function createHarness() {
  let frameCallback
  let frameId = 0
  let cancelledFrame
  let disconnected = false
  let trackStopped = false
  let contextClosed = false
  const samples = new Uint8Array(256).fill(128)
  const levels = []
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    getByteTimeDomainData(buffer) { buffer.set(samples) },
  }
  const source = {
    connect(target) { assert.equal(target, analyser) },
    disconnect() { disconnected = true },
  }
  const context = {
    state: 'running',
    createAnalyser: () => analyser,
    createMediaStreamSource: () => source,
    close() { contextClosed = true },
  }
  const stream = {
    getTracks: () => [{ stop() { trackStopped = true } }],
  }
  const meter = new MicrophoneLevelMeter({
    cancelFrame(id) { cancelledFrame = id },
    createAudioContext: () => context,
    getUserMedia: constraints => {
      assert.deepEqual(constraints, { audio: true })
      return Promise.resolve(stream)
    },
    onLevel: value => { levels.push(value) },
    requestFrame(callback) {
      frameCallback = callback
      frameId += 1
      return frameId
    },
  })

  return {
    context,
    levels,
    meter,
    samples,
    state: () => ({ cancelledFrame, contextClosed, disconnected, trackStopped }),
    tick: timestamp => frameCallback(timestamp),
  }
}

describe('MicrophoneLevelMeter', () => {
  it('emits measured microphone volume instead of a synthetic animation', async () => {
    const harness = createHarness()
    assert.equal(await harness.meter.start(), true)

    harness.tick(16)
    assert.equal(harness.levels.at(-1), 0)

    for (let index = 0; index < harness.samples.length; index += 1) {
      harness.samples[index] = index % 2 === 0 ? 32 : 224
    }
    harness.tick(80)
    assert.equal(harness.levels.length, 1)
    harness.tick(120)
    assert.equal(harness.levels.length, 2)
    assert.ok(harness.levels.at(-1) > 0.4)
    assert.ok(harness.levels.at(-1) <= 1)

    harness.meter.stop()
    assert.deepEqual(harness.state(), {
      cancelledFrame: 4,
      contextClosed: true,
      disconnected: true,
      trackStopped: true,
    })
    assert.equal(harness.levels.at(-1), 0)
  })

  it('fails quietly when local microphone metering is unavailable', async () => {
    const levels = []
    const meter = new MicrophoneLevelMeter({
      cancelFrame: () => {},
      createAudioContext: () => { throw new Error('unavailable') },
      getUserMedia: async () => { throw new Error('denied') },
      onLevel: value => { levels.push(value) },
      requestFrame: () => 1,
    })

    assert.equal(await meter.start(), false)
    assert.equal(levels.at(-1), 0)
  })
})
