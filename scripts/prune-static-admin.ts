import { rm } from 'node:fs/promises'

const targets = ['dist/admin']

for (const target of targets) {
  await rm(target, { recursive: true, force: true })
}

console.log('[build] pruned production-only admin pages from static output')
