import { describe, expect, it } from 'vitest'
import { parseReferencedObjectKeys, planOrphanCleanup } from '../scripts/listR2Orphans'

const now = new Date('2026-11-11T12:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString()

describe('r2 orphan cleanup plan', () => {
  it('only offers unreferenced objects older than 24 hours for deletion', () => {
    const plan = planOrphanCleanup({
      stored: [
        {
          key: 'source-images/live.jpg',
          size: 1,
          last_modified: hoursAgo(100),
        },
        {
          key: 'source-images/old-orphan.jpg',
          size: 1,
          last_modified: hoursAgo(25),
        },
        {
          key: 'source-images/fresh-upload.jpg',
          size: 1,
          last_modified: hoursAgo(1),
        },
        { key: 'source-images/no-timestamp.jpg', size: 1 },
        { key: 'source-images/bad-timestamp.jpg', size: 1, last_modified: 'yesterday-ish' },
        {
          key: 'source-images/future.jpg',
          size: 1,
          last_modified: hoursAgo(-48),
        },
      ],
      referenced: new Set(['source-images/live.jpg']),
      now,
    })

    expect(plan.orphans).toEqual([
      'source-images/bad-timestamp.jpg',
      'source-images/fresh-upload.jpg',
      'source-images/future.jpg',
      'source-images/no-timestamp.jpg',
      'source-images/old-orphan.jpg',
    ])
    expect(plan.deletable).toEqual(['source-images/old-orphan.jpg'])
  })

  it('refuses any deletion when the reference set is empty', () => {
    const plan = planOrphanCleanup({
      stored: [
        {
          key: 'source-images/a.jpg',
          size: 1,
          last_modified: hoursAgo(100),
        },
      ],
      referenced: new Set(),
      now,
    })

    expect(plan.orphans).toEqual(['source-images/a.jpg'])
    expect(plan.deletable).toEqual([])
    expect(plan.refusal).toMatch(/no D1 references/)
  })
})

describe('d1 reference payload', () => {
  it('reads object keys from the wrangler --json shape', () => {
    expect(parseReferencedObjectKeys([
      {
        results: [
          { objectKey: 'a' },
          { objectKey: 'b' },
        ],
      },
    ]))
      .toEqual(new Set(['a', 'b']))
  })

  it.each([
    {
      label: 'not an array',
      payload: { results: [] },
    },
    { label: 'no first statement', payload: [] },
    {
      label: 'results missing',
      payload: [{}],
    },
    {
      label: 'a row without objectKey',
      payload: [
        {
          results: [
            { object_key: 'a' },
          ],
        },
      ],
    },
  ])('rejects $label', ({ payload }) => {
    expect(() => parseReferencedObjectKeys(payload)).toThrow('Unexpected D1 payload shape')
  })
})
