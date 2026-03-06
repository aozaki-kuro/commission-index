import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  saveCharacterAliasesBatchAction,
  saveCreatorAliasesBatchAction,
  saveKeywordAliasesBatchAction,
} from '#admin/actions'
import FormStatusIndicator from '#admin/FormStatusIndicator'
import { INITIAL_FORM_STATE } from '#admin/types'
import { adminSurfaceStyles, formControlStyles } from '#admin/uiStyles'
import { Button } from '#components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs'
import { hasCjkCharacter } from '#lib/creatorAliases/shared'
import type { CharacterAliasRow, CreatorAliasRow, KeywordAliasRow } from '#lib/admin/db'

interface AliasesDashboardProps {
  characters: CharacterAliasRow[]
  creators: CreatorAliasRow[]
  keywords: KeywordAliasRow[]
}

const buildInitialCharacterDrafts = (characters: CharacterAliasRow[]) =>
  Object.fromEntries(characters.map(row => [row.characterName, row.aliases.join(', ')])) as Record<
    string,
    string
  >

const buildInitialCreatorDrafts = (creators: CreatorAliasRow[]) =>
  Object.fromEntries(creators.map(row => [row.creatorName, row.aliases[0] ?? ''])) as Record<
    string,
    string
  >

const buildInitialKeywordDrafts = (keywords: KeywordAliasRow[]) =>
  Object.fromEntries(keywords.map(row => [row.baseKeyword, row.aliases.join(', ')])) as Record<
    string,
    string
  >

const SaveButton = ({ label }: { label: string }) => {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : label}
    </Button>
  )
}

const CharacterAliasesPanel = ({ characters }: { characters: CharacterAliasRow[] }) => {
  const [state, formAction] = useActionState(saveCharacterAliasesBatchAction, INITIAL_FORM_STATE)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    buildInitialCharacterDrafts(characters),
  )

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        characters.map(row => ({
          characterName: row.characterName,
          aliases: drafts[row.characterName] ?? '',
        })),
      ),
    [characters, drafts],
  )

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="rowsJson" value={rowsPayload} />

      <div className="mb-4 flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            successLabel="Saved"
            errorFallback="Unable to save character aliases."
          />
          <SaveButton label="Save character aliases" />
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Character aliases have top priority over creator and keyword aliases for duplicate terms.
      </p>

      <div className="mb-4 hidden grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] gap-4 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:text-gray-300">
        <div>Character</div>
        <div>Aliases</div>
      </div>

      {characters.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">No characters available.</p>
      ) : (
        <div className="space-y-0">
          {characters.map(row => (
            <div
              key={row.characterName}
              className="grid gap-4 border-t border-gray-200/80 py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] md:items-center dark:border-gray-700/80"
            >
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {row.characterName}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.commissionCount} commission{row.commissionCount === 1 ? '' : 's'}
                </p>
              </div>

              <input
                type="text"
                value={drafts[row.characterName] ?? ''}
                onChange={event =>
                  setDrafts(prev => ({
                    ...prev,
                    [row.characterName]: event.target.value,
                  }))
                }
                className={formControlStyles}
                placeholder="e.g. 七市, ななし"
              />
            </div>
          ))}
        </div>
      )}
    </form>
  )
}

const CreatorAliasesPanel = ({ creators }: { creators: CreatorAliasRow[] }) => {
  const [state, formAction] = useActionState(saveCreatorAliasesBatchAction, INITIAL_FORM_STATE)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    buildInitialCreatorDrafts(creators),
  )
  const visibleCreators = useMemo(
    () => creators.filter(row => hasCjkCharacter(row.creatorName)),
    [creators],
  )

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        visibleCreators.map(row => ({
          creatorName: row.creatorName,
          alias: (drafts[row.creatorName] ?? '').trim(),
        })),
      ),
    [drafts, visibleCreators],
  )

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="rowsJson" value={rowsPayload} />

      <div className="mb-4 flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            successLabel="Saved"
            errorFallback="Unable to save creator aliases."
          />
          <SaveButton label="Save creator aliases" />
        </div>
      </div>

      <div className="mb-4 hidden grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] gap-4 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:text-gray-300">
        <div>Creator</div>
        <div>Alias</div>
      </div>

      {visibleCreators.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No creators available for alias editing.
        </p>
      ) : (
        <div className="space-y-0">
          {visibleCreators.map(row => (
            <div
              key={row.creatorName}
              className="grid gap-4 border-t border-gray-200/80 py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-center dark:border-gray-700/80"
            >
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {row.creatorName}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.commissionCount} commission{row.commissionCount === 1 ? '' : 's'}
                </p>
              </div>

              <input
                type="text"
                value={drafts[row.creatorName] ?? ''}
                onChange={event =>
                  setDrafts(prev => ({
                    ...prev,
                    [row.creatorName]: event.target.value,
                  }))
                }
                className={formControlStyles}
              />
            </div>
          ))}
        </div>
      )}
    </form>
  )
}

const KeywordAliasesPanel = ({ keywords }: { keywords: KeywordAliasRow[] }) => {
  const [state, formAction] = useActionState(saveKeywordAliasesBatchAction, INITIAL_FORM_STATE)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    buildInitialKeywordDrafts(keywords),
  )

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        keywords.map(row => ({
          baseKeyword: row.baseKeyword,
          aliases: drafts[row.baseKeyword] ?? '',
        })),
      ),
    [drafts, keywords],
  )

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="rowsJson" value={rowsPayload} />

      <div className="mb-4 flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            successLabel="Saved"
            errorFallback="Unable to save keyword aliases."
          />
          <SaveButton label="Save keyword aliases" />
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Keywords duplicated in Characters/Creator are hidden here to avoid mapping conflicts.
      </p>

      <div className="mb-4 hidden grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] gap-4 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:text-gray-300">
        <div>Base keyword</div>
        <div>Aliases</div>
      </div>

      {keywords.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No keywords available yet. Add keywords to commissions first.
        </p>
      ) : (
        <div className="space-y-0">
          {keywords.map(row => (
            <div
              key={row.baseKeyword}
              className="grid gap-4 border-t border-gray-200/80 py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] md:items-center dark:border-gray-700/80"
            >
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {row.baseKeyword}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.commissionCount} commission{row.commissionCount === 1 ? '' : 's'}
                </p>
              </div>

              <input
                type="text"
                value={drafts[row.baseKeyword] ?? ''}
                onChange={event =>
                  setDrafts(prev => ({
                    ...prev,
                    [row.baseKeyword]: event.target.value,
                  }))
                }
                className={formControlStyles}
                placeholder="e.g. 七市, ななし"
              />
            </div>
          ))}
        </div>
      )}
    </form>
  )
}

const AliasesDashboard = ({ characters, creators, keywords }: AliasesDashboardProps) => {
  return (
    <Tabs defaultValue="character">
      <TabsList className="flex w-full gap-2 rounded-xl border border-gray-200 bg-white/80 p-1 text-sm font-medium shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/60">
        <TabsTrigger
          value="character"
          className="flex-1 rounded-lg px-4 py-2.5 text-center transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800/60 dark:focus-visible:ring-offset-gray-900 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-900"
        >
          Character Aliases
        </TabsTrigger>
        <TabsTrigger
          value="creator"
          className="flex-1 rounded-lg px-4 py-2.5 text-center transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800/60 dark:focus-visible:ring-offset-gray-900 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-900"
        >
          Creator Aliases
        </TabsTrigger>
        <TabsTrigger
          value="keyword"
          className="flex-1 rounded-lg px-4 py-2.5 text-center transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800/60 dark:focus-visible:ring-offset-gray-900 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-900"
        >
          Keyword Aliases
        </TabsTrigger>
      </TabsList>

      <div className="mt-6 space-y-8">
        <TabsContent value="character" className="focus:outline-none">
          <CharacterAliasesPanel characters={characters} />
        </TabsContent>

        <TabsContent value="creator" className="focus:outline-none">
          <CreatorAliasesPanel creators={creators} />
        </TabsContent>

        <TabsContent value="keyword" className="focus:outline-none">
          <KeywordAliasesPanel keywords={keywords} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

export default AliasesDashboard
