import { describe, expect, it } from 'vitest'
import { createPublicBuildInfo, formatBuildLabel } from './buildInfo'

const meta = {
  revision: 'b889e3a673dab13609d363168df8b30637ce5a661008e446ddbfce28053250f8',
  exportedAt: '2000-01-01T00:00:00.000Z',
}

describe('public build info', () => {
  it('never exposes a commit sha', () => {
    expect(createPublicBuildInfo(meta, '2026-10-12T00:00:00.000Z')).toEqual({
      dataRevision: meta.revision,
      dataExportedAt: meta.exportedAt,
      codeSha: null,
      builtAt: '2026-10-12T00:00:00.000Z',
    })
  })

  it('formats the label from revision prefix and export date', () => {
    expect(formatBuildLabel(meta)).toBe('b889e3a · 2000-01-01')
  })

  it('tolerates short revisions and non-ISO timestamps', () => {
    expect(formatBuildLabel({ revision: 'abc', exportedAt: 'x' })).toBe('abc · x')
  })
})
