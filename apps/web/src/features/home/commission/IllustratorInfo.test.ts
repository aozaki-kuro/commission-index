import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(currentDir, 'IllustratorInfo.astro'), 'utf8')

describe('illustrator info static metadata', () => {
  it('renders Anon for unknown creators and labels numbered parts', () => {
    expect(source).toContain('const creatorName = commission.creatorName?.trim() || \'Anon\'')
    expect(source).toMatch(/const partLabel = commission\.partNumber == null \? null : `Part \$\{commission\.partNumber\}`/)
    expect(source).toContain('<span>{creatorName}</span>')
    expect(source).toContain('<span data-commission-part-label>{partLabel}</span>')
  })
})
