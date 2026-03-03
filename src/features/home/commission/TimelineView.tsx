import type { TimelineYearGroup } from '#lib/commissions/timeline'
import { getCharacterSectionId } from '#lib/characters/nav'
import AppLink from '#components/shared/AppLink'
import CommissionEntries from './CommissionEntries'

interface TimelineViewProps {
  groups: TimelineYearGroup[]
  creatorAliasesMap: Map<string, string[]> | null
}

const TimelineView = ({ groups, creatorAliasesMap }: TimelineViewProps) => {
  const monthSections = groups.map(group => (
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
          <AppLink
            href={group.navItem.sectionHash}
            className="ml-2 font-bold text-gray-400 no-underline opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-gray-600"
          >
            #
          </AppLink>
        </h2>
      </div>
      <CommissionEntries
        entries={group.entries.map(entry => ({
          character: entry.character,
          commission: entry.commission,
          sectionId: group.sectionId,
          entryKey: `${group.yearKey}:${entry.character}:${entry.commission.fileName}`,
          entryAnchorPrefix: getCharacterSectionId(entry.character),
        }))}
        creatorAliasesMap={creatorAliasesMap}
      />
    </section>
  ))

  return <div>{monthSections}</div>
}

export default TimelineView
