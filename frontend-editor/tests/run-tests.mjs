// Test runner: bundles the test file with esbuild (resolving the "@" alias),
// injects a localStorage mock, then executes the bundle in this Node process.
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

const outFile = join(tmpdir(), `mira-tests-${Date.now()}.mjs`)

await build({
  entryPoints: ['tests/documents.test.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
  alias: { '@': new URL('../src/', import.meta.url).pathname }
})

// Minimal in-memory localStorage injected before any module accesses it.
const memStore = new Map()
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear()
}

try {
  await import(pathToFileURL(outFile).href)
} catch (err) {
  console.error('Test bundle crashed:', err)
  rmSync(outFile, { force: true })
  process.exit(1)
}
rmSync(outFile, { force: true })
