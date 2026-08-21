const DEFAULT_FFT_SIZE = 256

function clampLevel(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    try { track.stop() } catch {}
  }
}

/** Measures microphone RMS volume locally with the Web Audio API. */
export class MicrophoneLevelMeter {
  constructor(options) {
    this.options = options
    this.active = false
    this.generation = 0
    this.frameId = null
    this.stream = null
    this.context = null
    this.source = null
    this.analyser = null
    this.samples = null
    this.level = 0
    this.lastEmission = null
  }

  async start() {
    if (this.active) return false
    this.active = true
    const generation = ++this.generation

    try {
      const stream = await this.options.getUserMedia({ audio: true })
      if (!this.active || generation !== this.generation) {
        stopStream(stream)
        return false
      }

      this.stream = stream
      this.context = this.options.createAudioContext()
      if (this.context.state === 'suspended') await this.context.resume()
      if (!this.active || generation !== this.generation) {
        this.releaseResources()
        return false
      }

      this.source = this.context.createMediaStreamSource(stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = DEFAULT_FFT_SIZE
      this.analyser.smoothingTimeConstant = 0.72
      this.samples = new Uint8Array(this.analyser.fftSize)
      this.source.connect(this.analyser)
      this.frameId = this.options.requestFrame(timestamp => this.measure(timestamp, generation))
      return true
    } catch {
      if (generation === this.generation) {
        this.active = false
        this.releaseResources()
        this.options.onLevel(0)
      }
      return false
    }
  }

  stop() {
    if (!this.active && this.stream === null && this.context === null) return false
    this.active = false
    this.generation += 1
    if (this.frameId !== null) {
      this.options.cancelFrame(this.frameId)
      this.frameId = null
    }
    this.releaseResources()
    this.level = 0
    this.lastEmission = null
    this.options.onLevel(0)
    return true
  }

  measure(timestamp, generation) {
    if (!this.active || generation !== this.generation || this.analyser === null) return

    this.analyser.getByteTimeDomainData(this.samples)
    let sumSquares = 0
    for (const sample of this.samples) {
      const centered = (sample - 128) / 128
      sumSquares += centered * centered
    }
    const rms = Math.sqrt(sumSquares / this.samples.length)
    const measured = clampLevel((rms - 0.012) * 2.2)
    const smoothing = measured > this.level ? 0.72 : 0.2
    this.level = clampLevel(this.level + (measured - this.level) * smoothing)
    if (this.level < 0.008) this.level = 0

    if (this.lastEmission === null || timestamp - this.lastEmission >= 50) {
      this.lastEmission = timestamp
      this.options.onLevel(this.level)
    }
    this.frameId = this.options.requestFrame(nextTimestamp => this.measure(nextTimestamp, generation))
  }

  releaseResources() {
    if (this.source !== null) {
      try { this.source.disconnect() } catch {}
    }
    stopStream(this.stream)
    if (this.context !== null) {
      try {
        const closing = this.context.close()
        closing?.catch?.(() => {})
      } catch {}
    }
    this.stream = null
    this.context = null
    this.source = null
    this.analyser = null
    this.samples = null
  }
}

export function createBrowserMicrophoneLevelMeter(onLevel) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null
  const AudioContext = window.AudioContext ?? window.webkitAudioContext
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (AudioContext === undefined || getUserMedia === undefined) return null

  return new MicrophoneLevelMeter({
    cancelFrame: id => window.cancelAnimationFrame(id),
    createAudioContext: () => new AudioContext(),
    getUserMedia,
    onLevel,
    requestFrame: callback => window.requestAnimationFrame(callback),
  })
}
