const PACKAGE_NAME = 'dsh-speech-input'

export const name = 'dsh-speech-input-invariant'
export const inject = ['invariants']

export function apply(ctx) {
  return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, () => {}))
}
