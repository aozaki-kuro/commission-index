import type { CharacterAliasRow, CreatorAliasRow, KeywordAliasRow } from '@commission-index/domain'
import type { KeyboardEvent } from 'react'
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
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSelect(tab)}
      className={`
        relative inline-flex min-w-0 items-center justify-center gap-1 px-0 pb-2.5 text-xs font-medium sm:gap-2 sm:px-1 sm:text-sm
        transition
        focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-gray-400
        focus-visible:ring-offset-2 focus-visible:ring-offset-white
        focus-visible:rounded-sm
        dark:focus-visible:ring-offset-neutral-900
        ${isActive
      ? `text-gray-900 dark:text-gray-100`
      : `text-gray-500 hover:text-gray-700
         dark:text-gray-400 dark:hover:text-gray-200`}
      `}
    >
      {label}
      <span className={`
        inline-flex min-w-5 items-center justify-center rounded-full
        px-1.5 py-0.5 text-[11px] font-semibold leading-none
        ${isActive
      ? `bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900`
      : `bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300`}
      `}
      >
        {count ?? '–'}
      </span>
      {isActive
        ? (
            <span
              aria-hidden="true"
              className="
                absolute right-0 bottom-0 left-0 h-0.5 rounded-full
                bg-gray-900
                dark:bg-gray-100
              "
            />
          )
        : null}
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

  // Stable references — these pure functions never change
  const buildCharacter = useCallback(buildCharacterPayload, [])
  const buildCreator = useCallback(buildCreatorPayload, [])
  const buildKeyword = useCallback(buildKeywordPayload, [])

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
          grid grid-cols-3 gap-2 border-b border-gray-200 sm:flex sm:gap-5
          dark:border-gray-700
        "
      >
        <TabButton
          activeTab={activeTab}
          count={isLoading || isUnavailable ? null : characterRows.length}
          label="Character"
          onSelect={setActiveTab}
          tab="character"
        />
        <TabButton
          activeTab={activeTab}
          count={isLoading || isUnavailable ? null : creatorRows.length}
          label="Creator"
          onSelect={setActiveTab}
          tab="creator"
        />
        <TabButton
          activeTab={activeTab}
          count={isLoading || isUnavailable ? null : keywordRows.length}
          label="Keyword"
          onSelect={setActiveTab}
          tab="keyword"
        />
      </div>

      <div>
        <div
          key="character"
          id="aliases-panel-character"
          role="tabpanel"
          aria-labelledby="aliases-tab-character"
          hidden={activeTab !== 'character'}
          className="motion-safe:animate-[tabFade_200ms_ease-out]"
        >
          <AliasPanel
            rows={characterRows}
            formAction={saveCharacterAliasesBatchAction}
            title="Character aliases"
            description="Character aliases have top priority over creator and keyword aliases for duplicate terms."
            saveLabel="Save character aliases"
            errorFallback="Unable to save character aliases."
            emptyMessage="No characters available."
            columnHeader="Character"
            placeholder="e.g. 七市, ななし"
            buildPayload={buildCharacter}
            isLoading={isLoading}
            isUnavailable={isUnavailable}
            onSaved={onSaved}
          />
        </div>
        <div
          key="creator"
          id="aliases-panel-creator"
          role="tabpanel"
          aria-labelledby="aliases-tab-creator"
          hidden={activeTab !== 'creator'}
          className="motion-safe:animate-[tabFade_200ms_ease-out]"
        >
          <AliasPanel
            rows={creatorRows}
            formAction={saveCreatorAliasesBatchAction}
            title="Creator aliases"
            description="Edit romanized aliases for creators with CJK names to stabilize search matching."
            saveLabel="Save creator aliases"
            errorFallback="Unable to save creator aliases."
            emptyMessage="No creators available for alias editing."
            columnHeader="Creator"
            buildPayload={buildCreator}
            isLoading={isLoading}
            isUnavailable={isUnavailable}
            onSaved={onSaved}
          />
        </div>
        <div
          key="keyword"
          id="aliases-panel-keyword"
          role="tabpanel"
          aria-labelledby="aliases-tab-keyword"
          hidden={activeTab !== 'keyword'}
          className="motion-safe:animate-[tabFade_200ms_ease-out]"
        >
          <AliasPanel
            rows={keywordRows}
            formAction={saveKeywordAliasesBatchAction}
            title="Keyword aliases"
            description="Keywords duplicated in character or creator aliases are hidden here to avoid mapping conflicts."
            saveLabel="Save keyword aliases"
            errorFallback="Unable to save keyword aliases."
            emptyMessage="No keywords available yet. Add keywords to commissions first."
            columnHeader="Base keyword"
            placeholder="e.g. full body, fullbody"
            buildPayload={buildKeyword}
            isLoading={isLoading}
            isUnavailable={isUnavailable}
            onSaved={onSaved}
          />
        </div>
      </div>
    </section>
  )
}
