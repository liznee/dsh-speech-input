const CHINESE = /\p{Script=Han}/u
const ASCII_WORD = /[A-Za-z0-9]/

function boundarySpace(left, right) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return ''
  const last = left.at(-1)
  const first = right.at(0)
  if (ASCII_WORD.test(last) && ASCII_WORD.test(first)) return ' '
  if (/[,.!?:;]/.test(last) && ASCII_WORD.test(first)) return ' '
  return ''
}

/** Append dictated text without inserting spaces between Chinese phrases. */
export function joinDraft(draft, speech) {
  const left = String(draft ?? '')
  const right = String(speech ?? '').trim()
  if (!right) return left
  return `${left}${boundarySpace(left, right)}${right}`
}

function joinSpeech(left, right) {
  const first = String(left ?? '').trim()
  const second = String(right ?? '').trim()
  if (!first) return second
  if (!second) return first
  return `${first}${boundarySpace(first, second)}${second}`
}

/**
 * Replace the transcript previously written by this recording session while
 * retaining text the user typed before or after it.
 */
export function mergeRecognitionDraft(currentDraft, baseDraft, previousSpeech, nextSpeech) {
  const current = String(currentDraft ?? '')
  const base = String(baseDraft ?? '')
  const previous = String(previousSpeech ?? '').trim()
  const next = String(nextSpeech ?? '').trim()
  const previousRendered = joinDraft(base, previous)
  const nextRendered = joinDraft(base, next)

  if (!previous) {
    return current === base ? nextRendered : joinDraft(current, next)
  }
  if (current === previousRendered) return nextRendered

  // The common concurrent-edit case: the user typed a suffix while speech was
  // updating. Replace only the plugin-owned prefix and retain that suffix.
  if (current.startsWith(previousRendered)) {
    return `${nextRendered}${current.slice(previousRendered.length)}`
  }

  // If the user edited before the dictated tail, replace the exact tail only.
  if (current.endsWith(previous)) {
    return `${current.slice(0, -previous.length)}${next}`
  }

  // If the recognizer only extended a transcript whose text the user changed,
  // append the new delta. Corrections are left alone rather than overwriting a
  // manual edit we can no longer locate safely.
  if (next.startsWith(previous)) return joinDraft(current, next.slice(previous.length))
  return current
}

/** Apply final-only punctuation without modifying live interim text. */
export function applyPunctuation(text, mode = 'smart') {
  let value = String(text ?? '').trim()
  if (!value) return value
  if (mode === 'keep') return value
  if (mode === 'none') return value.replace(/\p{P}/gu, '').replace(/\s+/g, ' ').trim()

  value = value.replace(/[，,]+\s*$/u, '').trim()
  if (!value || /[。！？.!?…]$/u.test(value)) return value
  if (CHINESE.test(value)) {
    if (/[吗呢么]$/u.test(value)) return `${value}？`
    if (/[吧啊呀哦嘛啦哇哈]$/u.test(value)) return `${value}！`
    return `${value}。`
  }
  return `${value}.`
}

function readResults(results) {
  let finalText = ''
  let interimText = ''
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const transcript = String(result?.[0]?.transcript ?? '')
    if (result?.isFinal) finalText = joinSpeech(finalText, transcript)
    else interimText = joinSpeech(interimText, transcript)
  }
  return { finalText, interimText }
}

function failureReason(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'permission-denied'
  if (error === 'audio-capture') return 'microphone-unavailable'
  if (error === 'network') return 'network'
  return 'recognition-failed'
}

/** Browser-independent state machine around the Web Speech API. */
export class VoiceRecognitionController {
  constructor(options) {
    this.options = options
    this.recognition = null
    this.active = false
    this.destroyed = false
    this.generation = 0
    this.baseDraft = ''
    this.speech = ''
    this.committedRounds = ''
    this.roundFinal = ''
    this.roundInterim = ''
    this.silentEnds = 0
  }

  start() {
    if (this.destroyed || this.active) return false
    this.active = true
    this.generation += 1
    this.baseDraft = String(this.options.getDraft() ?? '')
    this.speech = ''
    this.committedRounds = ''
    this.roundFinal = ''
    this.roundInterim = ''
    this.silentEnds = 0
    this.options.onState({ phase: 'starting' })
    return this.openRecognition(this.generation)
  }

  stop() {
    if (!this.active) return false
    this.active = false
    this.generation += 1
    const recognition = this.recognition
    this.recognition = null
    if (recognition !== null) {
      try { recognition.stop() } catch {}
    }
    this.finishDraft()
    this.options.onState({ phase: 'idle' })
    return true
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.active = false
    this.generation += 1
    const recognition = this.recognition
    this.recognition = null
    if (recognition !== null) {
      try { recognition.abort() } catch {}
    }
  }

  openRecognition(generation) {
    let recognition
    try {
      recognition = this.options.createRecognition()
    } catch {
      this.active = false
      this.options.onState({ phase: 'error', reason: 'unsupported' })
      return false
    }
    if (recognition === null || recognition === undefined) {
      this.active = false
      this.options.onState({ phase: 'error', reason: 'unsupported' })
      return false
    }

    this.recognition = recognition
    this.roundFinal = ''
    this.roundInterim = ''
    recognition.lang = this.options.language()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onstart = () => {
      if (this.active && generation === this.generation) {
        this.options.onState({ phase: 'listening' })
      }
    }
    recognition.onresult = event => {
      if (!this.active || generation !== this.generation) return
      const { finalText, interimText } = readResults(event.results)
      this.roundFinal = finalText
      this.roundInterim = interimText
      const round = joinSpeech(finalText, interimText)
      this.updateDraft(joinSpeech(this.committedRounds, round))
      if (round) this.silentEnds = 0
    }
    recognition.onerror = event => {
      if (!this.active || generation !== this.generation) return
      const error = String(event?.error ?? 'unknown')
      if (error === 'no-speech' || error === 'aborted') return
      this.active = false
      this.generation += 1
      this.recognition = null
      this.options.onState({ phase: 'error', reason: failureReason(error) })
    }
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null
      if (!this.active || this.destroyed || generation !== this.generation) return

      const round = joinSpeech(this.roundFinal, this.roundInterim)
      if (round) {
        this.committedRounds = joinSpeech(this.committedRounds, round)
        this.silentEnds = 0
      } else {
        this.silentEnds += 1
      }

      const maximum = this.options.maxSilentRestarts ?? 6
      if (this.silentEnds >= maximum) {
        this.active = false
        this.generation += 1
        this.finishDraft()
        this.options.onState({ phase: 'idle' })
        return
      }

      const restartGeneration = this.generation
      const schedule = this.options.schedule ?? (callback => setTimeout(callback, 180))
      schedule(() => {
        if (this.active && !this.destroyed && restartGeneration === this.generation) {
          this.openRecognition(restartGeneration)
        }
      })
    }

    try {
      recognition.start()
      return true
    } catch {
      this.active = false
      this.recognition = null
      this.options.onState({ phase: 'error', reason: 'start-failed' })
      return false
    }
  }

  updateDraft(nextSpeech) {
    const next = String(nextSpeech ?? '').trim()
    const draft = mergeRecognitionDraft(
      this.options.getDraft(),
      this.baseDraft,
      this.speech,
      next,
    )
    this.speech = next
    this.options.setDraft(draft)
  }

  finishDraft() {
    if (!this.speech) return
    this.updateDraft(applyPunctuation(this.speech, this.options.punctuation()))
  }
}
