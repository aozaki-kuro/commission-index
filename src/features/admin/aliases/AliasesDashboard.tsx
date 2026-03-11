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

const tabListStyles =
  'grid w-full gap-2 rounded-2xl border border-gray-200 bg-white/90 p-1.5 shadow-sm ring-1 ring-gray-900/5 backdrop-blur-sm sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10'
const tabTriggerStyles =
  'inline-flex items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2.5 text-sm text-gray-700 transition focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none hover:border-gray-300/80 hover:bg-white dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800/70 dark:focus-visible:ring-offset-gray-900 data-[state=active]:border-gray-900/15 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:data-[state=active]:border-gray-100/20 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-900'
const tabCountStyles =
  'inline-flex min-w-7 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'
const panelHeaderTitleStyles = 'text-base font-semibold text-gray-900 dark:text-gray-100'
const panelHeaderDescriptionStyles = 'text-sm text-gray-600 dark:text-gray-300'
const tableShellStyles = 'space-y-0'
const tableHeaderStyles =
  'hidden gap-4 border-b border-gray-200/80 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:border-gray-700/80 dark:text-gray-300'
const tableRowStyles = 'grid gap-4 px-4 py-3 md:items-center'
const tableDividerStyles = 'border-t border-gray-200/80 dark:border-gray-700/80'
const characterGridTemplate = 'md:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)]'
const creatorGridTemplate = characterGridTemplate

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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className={panelHeaderTitleStyles}>Character aliases</h3>
          <p className={panelHeaderDescriptionStyles}>
            Character aliases have top priority over creator and keyword aliases for duplicate
            terms.
          </p>
        </div>

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

      {characters.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">No characters available.</p>
      ) : (
        <div className={tableShellStyles}>
          <div className={`${tableHeaderStyles} ${characterGridTemplate}`}>
            <div>Character</div>
            <div>Aliases</div>
          </div>

          {characters.map(row => (
            <div
              key={row.characterName}
              className={`${tableRowStyles} ${characterGridTemplate} ${tableDividerStyles} first:border-t-0`}
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className={panelHeaderTitleStyles}>Creator aliases</h3>
          <p className={panelHeaderDescriptionStyles}>
            Edit romanized aliases for creators with CJK names to stabilize search matching.
          </p>
        </div>

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

      {visibleCreators.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No creators available for alias editing.
        </p>
      ) : (
        <div className={tableShellStyles}>
          <div className={`${tableHeaderStyles} ${creatorGridTemplate}`}>
            <div>Creator</div>
            <div>Aliases</div>
          </div>

          {visibleCreators.map(row => (
            <div
              key={row.creatorName}
              className={`${tableRowStyles} ${creatorGridTemplate} ${tableDividerStyles} first:border-t-0`}
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className={panelHeaderTitleStyles}>Keyword aliases</h3>
          <p className={panelHeaderDescriptionStyles}>
            Keywords duplicated in character or creator aliases are hidden here to avoid mapping
            conflicts.
          </p>
        </div>

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

      {keywords.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No keywords available yet. Add keywords to commissions first.
        </p>
      ) : (
        <div className={tableShellStyles}>
          <div className={`${tableHeaderStyles} ${characterGridTemplate}`}>
            <div>Base keyword</div>
            <div>Aliases</div>
          </div>

          {keywords.map(row => (
            <div
              key={row.baseKeyword}
              className={`${tableRowStyles} ${characterGridTemplate} ${tableDividerStyles} first:border-t-0`}
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
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alias mapping</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Keep search synonyms consistent across character, creator, and keyword dimensions.
        </p>
      </header>

      <Tabs defaultValue="character">
        <TabsList className={tabListStyles}>
          <TabsTrigger value="character" className={tabTriggerStyles}>
            <span>Character</span>
            <span className={tabCountStyles}>{characters.length}</span>
          </TabsTrigger>
          <TabsTrigger value="creator" className={tabTriggerStyles}>
            <span>Creator</span>
            <span className={tabCountStyles}>
              {creators.filter(row => hasCjkCharacter(row.creatorName)).length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="keyword" className={tabTriggerStyles}>
            <span>Keyword</span>
            <span className={tabCountStyles}>{keywords.length}</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-5 space-y-6">
          <TabsContent value="character">
            <CharacterAliasesPanel characters={characters} />
          </TabsContent>

          <TabsContent value="creator">
            <CreatorAliasesPanel creators={creators} />
          </TabsContent>

          <TabsContent value="keyword">
            <KeywordAliasesPanel keywords={keywords} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}

export default AliasesDashboard
