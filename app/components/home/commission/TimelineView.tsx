import type { TimelineYearGroup } from '#lib/commissions/timeline'
import Link from 'next/link'
import CommissionEntries from './CommissionEntries'

interface TimelineViewProps {
  groups: TimelineYearGroup[]
  creatorAliasesMap: Map<string, string[]> | null
}

const TimelineView = async ({ groups, creatorAliasesMap }: TimelineViewProps) => {
  const monthSections = await Promise.all(
    groups.map(async group => (
      <section
        key={group.yearKey}
        id={group.sectionId}
        data-character-section="true"
        data-total-commissions={group.entries.length}
        className="pb-6"
      >
        <div id={group.titleId} className="mb-2 pt-4">
          <h2 className="group relative">
            {group.yearKey}
            <Link
              href={group.navItem.sectionHash}
              className="ml-2 font-bold text-gray-400 no-underline opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-gray-600"
            >
              #
            </Link>
          </h2>
        </div>
        {await CommissionEntries({
          entries: group.entries.map((entry, index) => ({
            character: entry.character,
            commission: entry.commission,
            sectionId: group.sectionId,
            entryKey: `${group.yearKey}:${entry.character}:${entry.commission.fileName}`,
            entryAnchorPrefix: `${group.sectionId}-${index + 1}`,
          })),
          creatorAliasesMap,
        })}
      </section>
    )),
  )

  return <div>{monthSections}</div>
}

export default TimelineView
