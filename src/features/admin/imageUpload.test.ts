import fs from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSourceImagePathByStem } from './imageUpload'

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}))

const createEnoent = () => {
  const error = new Error('not found') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

describe('resolveSourceImagePathByStem', () => {
  beforeEach(() => {
    vi.mocked(fs.access).mockReset()
  })

  it('returns jpg when jpg exists', async () => {
    vi.mocked(fs.access).mockImplementation(async targetPath => {
      if (String(targetPath).endsWith('.jpg')) return
      throw createEnoent()
    })

    const resolved = await resolveSourceImagePathByStem('20260208_Dorei')

    expect(resolved?.filePath).toMatch(/20260208_Dorei\.jpg$/)
    expect(resolved?.mimeType).toBe('image/jpeg')
  })

  it('falls back to png when jpg/jpeg are missing', async () => {
    vi.mocked(fs.access).mockImplementation(async targetPath => {
      if (String(targetPath).endsWith('.png')) return
      throw createEnoent()
    })

    const resolved = await resolveSourceImagePathByStem('20260226_七市')

    expect(resolved?.filePath).toMatch(/20260226_七市\.png$/)
    expect(resolved?.mimeType).toBe('image/png')
  })

  it('returns null when no candidate exists', async () => {
    vi.mocked(fs.access).mockRejectedValue(createEnoent())

    const resolved = await resolveSourceImagePathByStem('20260226_七市')

    expect(resolved).toBeNull()
  })
})
