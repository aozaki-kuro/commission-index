import type { CharacterAliasRow, CreatorAliasRow, KeywordAliasRow } from '@commission-index/domain'
import type { ComponentProps, KeyboardEvent } from 'react'
import type { AliasRow } from './AliasPanel'
import { hasCjkCharacter } from '@commission-index/domain'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  saveCharacterAliasesBatchAction,
  saveCreatorAliasesBatchAction,
  saveKeywordAliasesBatchAction,
} from '../lib/adminActions'
import { AliasPanel } from './AliasPanel'

interface AdminAliasesDashboardProps {
  characters: CharacterAliasRow[]
  creators: CreatorAliasRow[]
  keywords: KeywordAliasRow[]
  isLoading?: boolean
  isUnavailable?: boolean
  onSaved?: () => void
}

type AliasTab = 'character' | 'creator' | 'keyword'

const aliasTabs: AliasTab[] = ['character', 'creator', 'keyword']

function toCharacterAliasRows(characters: CharacterAliasRow[]): AliasRow[] {
  return characters.map(row => ({
    key: row.characterName,
    count: row.commissionCount,
    initialValue: row.aliases.join(', '),
  }))
}

function toCreatorAliasRows(creators: CreatorAliasRow[]): AliasRow[] {
  return creators
    .filter(row => hasCjkCharacter(row.creatorName))
    .map(row => ({
      key: row.creatorName,
      count: row.commissionCount,
      initialValue: row.aliases.join(', '),
    }))
}

function toKeywordAliasRows(keywords: KeywordAliasRow[]): AliasRow[] {
  return keywords.map(row => ({
    key: row.baseKeyword,
    count: row.commissionCount,
    initialValue: row.aliases.join(', '),
  }))
}

function buildCharacterPayload(rows: AliasRow[], drafts: Record<string, string>) {
  return JSON.stringify(rows.map(row => ({
    characterName: row.key,
    aliases: drafts[row.key] ?? '',
  })))
}

function buildCreatorPayload(rows: AliasRow[], drafts: Record<string, string>) {
  return JSON.stringify(rows.map(row => ({
    creatorName: row.key,
    aliases: (drafts[row.key] ?? '').trim(),
  })))
}

function buildKeywordPayload(rows: AliasRow[], drafts: Record<string, string>) {
  return JSON.stringify(rows.map(row => ({
    baseKeyword: row.key,
    aliases: drafts[row.key] ?? '',
  })))
}

type AliasPanelConfig = Omit<ComponentProps<typeof AliasPanel>, 'isLoading' | 'isUnavailable' | 'onSaved' | 'rows'>

interface AliasTabConfig {
  label: string
  panel: AliasPanelConfig
  rows: AliasRow[]
  tab: AliasTab
}

interface TabButtonProps {
  activeTab: AliasTab
  count: number | null
  label: string
  onSelect: (tab: AliasTab) => void
  tab: AliasTab
}

function TabButton({ activeTab, count, label, onSelect, tab }: TabButtonProps) {
  const isActive = activeTab === tab

  return (
    <button
      id={`aliases-tab-${tab}`}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`aliases-panel-${tab}`}
      tabIndex={isActive
        ? 0
        : -1}
      onClick={() => onSelect(tab)}
      className={`
        relative inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium sm:gap-2 sm:px-4 sm:text-sm
        transition
        focus-visible:outline-2 focus-visible:outline-offset-2
        ${isActive
      ? `bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100`
      : `text-gray-500 hover:text-gray-700
         dark:text-gray-400 dark:hover:text-gray-200`}
      `}
    >
      {label}
      <span className={`
        inline-flex min-w-5 items-center justify-center
        tabular-nums text-2xs leading-none
        ${isActive
      ? `text-gray-600 dark:text-gray-300`
      : `text-gray-500 dark:text-gray-400`}
      `}
      >
        {count ?? '–'}
      </span>
    </button>
  )
}

export function AdminAliasesDashboard({
  characters,
  creators,
  keywords,
  isLoading = false,
  isUnavailable = false,
  onSaved,
}: AdminAliasesDashboardProps) {
  const [activeTab, setActiveTab] = useState<AliasTab>('character')
  const tablistRef = useRef<HTMLDivElement>(null)

  const characterRows = useMemo(() => toCharacterAliasRows(characters), [characters])
  const creatorRows = useMemo(() => toCreatorAliasRows(creators), [creators])
  const keywordRows = useMemo(() => toKeywordAliasRows(keywords), [keywords])

  const tabs: AliasTabConfig[] = [
    {
      label: 'Character',
      panel: {
        formAction: saveCharacterAliasesBatchAction,
        title: 'Character aliases',
        description: 'Character aliases have top priority over creator and keyword aliases for duplicate terms.',
        saveLabel: 'Save character aliases',
        errorFallback: 'Unable to save character aliases.',
        emptyMessage: 'No characters available.',
        columnHeader: 'Character',
        placeholder: 'e.g. 七市, ななし',
        buildPayload: buildCharacterPayload,
      },
      rows: characterRows,
      tab: 'character',
    },
    {
      label: 'Creator',
      panel: {
        formAction: saveCreatorAliasesBatchAction,
        title: 'Creator aliases',
        description: 'Edit romanized aliases for creators with CJK names to stabilize search matching.',
        saveLabel: 'Save creator aliases',
        errorFallback: 'Unable to save creator aliases.',
        emptyMessage: 'No creators available for alias editing.',
        columnHeader: 'Creator',
        buildPayload: buildCreatorPayload,
      },
      rows: creatorRows,
      tab: 'creator',
    },
    {
      label: 'Keyword',
      panel: {
        formAction: saveKeywordAliasesBatchAction,
        title: 'Keyword aliases',
        description: 'Keywords duplicated in character or creator aliases are hidden here to avoid mapping conflicts.',
        saveLabel: 'Save keyword aliases',
        errorFallback: 'Unable to save keyword aliases.',
        emptyMessage: 'No keywords available yet. Add keywords to commissions first.',
        columnHeader: 'Base keyword',
        placeholder: 'e.g. full body, fullbody',
        buildPayload: buildKeywordPayload,
      },
      rows: keywordRows,
      tab: 'keyword',
    },
  ]

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = aliasTabs.indexOf(activeTab)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      nextIndex = (currentIndex + 1) % aliasTabs.length
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      nextIndex = (currentIndex - 1 + aliasTabs.length) % aliasTabs.length
    }
    else if (event.key === 'Home') {
      event.preventDefault()
      nextIndex = 0
    }
    else if (event.key === 'End') {
      event.preventDefault()
      nextIndex = aliasTabs.length - 1
    }

    if (nextIndex !== null) {
      const nextTab = aliasTabs[nextIndex]
      setActiveTab(nextTab)
      const nextButton = tablistRef.current?.querySelector<HTMLButtonElement>(
        `#aliases-tab-${nextTab}`,
      )
      nextButton?.focus()
    }
  }, [activeTab])

  return (
    <section className="space-y-5">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Alias mapping sections"
        onKeyDown={handleTabKeyDown}
        className="
          grid grid-cols-3 gap-1 rounded-lg bg-gray-100/80 p-1 sm:w-fit sm:min-w-96
          dark:bg-gray-950/50
        "
      >
        {tabs.map(({ label, rows, tab }) => (
          <TabButton
            key={tab}
            activeTab={activeTab}
            count={isLoading || isUnavailable
              ? null
              : rows.length}
            label={label}
            onSelect={setActiveTab}
            tab={tab}
          />
        ))}
      </div>

      <div>
        {tabs.map(({ panel, rows, tab }) => (
          <div
            key={tab}
            id={`aliases-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`aliases-tab-${tab}`}
            hidden={activeTab !== tab}
          >
            <AliasPanel
              rows={rows}
              {...panel}
              isLoading={isLoading}
              isUnavailable={isUnavailable}
              onSaved={onSaved}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
