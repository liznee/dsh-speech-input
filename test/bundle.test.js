import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)

describe('published bundle', () => {
  it('ships a self-activating dsh bundle patch', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
    assert.match(patch, /name: dsh-speech-input/)
  })

  it('loads through the Harness module-loader factory', async () => {
    const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    let registration = null
    const sandbox = {
      window: {
        __ModuleLoader__: {
          load(value) { registration = value },
        },
      },
    }
    vm.runInNewContext(source, sandbox)

    assert.equal(registration.id, 'dsh-speech-input')
    const client = registration.factory(require)
    assert.equal(typeof client.apply, 'function')
    assert.deepEqual([...client.inject], ['slots', 'locale'])
  })
})
