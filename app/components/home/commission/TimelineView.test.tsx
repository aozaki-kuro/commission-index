// @vitest-environment jsdom
import type { TimelineYearGroup } from '#lib/commissions/timeline'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TimelineView from './TimelineView'

const mockCommissionEntries = vi.fn(
  async ({ entries }: { entries: { entryAnchorPrefix: string }[] }) => (
    <div data-testid="entry-prefixes">
      {entries.map(entry => entry.entryAnchorPrefix).join(',')}
    </div>
  ),
)

vi.mock('./CommissionEntries', () => ({
  default: (...args: Parameters<typeof mockCommissionEntries>) => mockCommissionEntries(...args),
}))

describe('TimelineView', () => {
  it('uses character section id as anchor prefix for timeline entries', async () => {
    const groups: TimelineYearGroup[] = [
      {
        yearKey: '2026',
        sectionId: 'timeline-year-2026',
        titleId: 'title-timeline-year-2026',
        navItem: {
          displayName: '2026',
          sectionId: 'timeline-year-2026',
          titleId: 'title-timeline-year-2026',
          sectionHash: '#timeline-year-2026',
          titleHash: '#title-timeline-year-2026',
        },
        entries: [
          {
            character: 'Test Character',
            commission: {
              fileName: '20260225',
              Links: [],
            },
          },
        ],
      },
    ]

    render(await TimelineView({ groups, creatorAliasesMap: new Map() }))

    expect(screen.getByTestId('entry-prefixes')).toHaveTextContent('test-character')
    expect(mockCommissionEntries).toHaveBeenCalledTimes(1)
  })
})
