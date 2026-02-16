'use client'

import {
  Description,
  Field,
  Input,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Switch,
  Textarea,
  Transition,
} from '@headlessui/react'
import { Fragment, useActionState, useEffect, useMemo, useState } from 'react'

import type { CharacterStatus } from '#lib/admin/db'
import { addCommissionAction } from '#admin/actions'
import { notifyDataUpdate } from './dataUpdateSignal'
import FormStatusIndicator from './FormStatusIndicator'
import SubmitButton from './SubmitButton'
import { INITIAL_FORM_STATE } from './types'

interface CharacterOption {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
}

interface AddCommissionFormProps {
  characters: CharacterOption[]
}

const controlStyles =
  'w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100 dark:focus-visible:ring-offset-gray-900'

const AddCommissionForm = ({ characters }: AddCommissionFormProps) => {
  const [state, formAction] = useActionState(addCommissionAction, INITIAL_FORM_STATE)
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    if (state.status === 'success') notifyDataUpdate()
  }, [state.status])

  const options = useMemo(
    () => [...characters].sort((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const selectedCharacter = useMemo(
    () => options.find(option => option.id === characterId) ?? null,
    [options, characterId],
  )

  const hasCharacters = options.length > 0

  return (
    <form
      action={formAction}
      className="flex min-w-[20rem] flex-1 flex-col gap-5 rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm ring-1 ring-gray-900/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Add Commission Entry
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Append a new commission record to an existing character. Links accept multiple lines.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Character
          </Label>
          <Listbox value={characterId} onChange={setCharacterId} disabled={!hasCharacters}>
            <div className="relative">
              <ListboxButton
                className={`${controlStyles} flex items-center justify-between ${!hasCharacters ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <span
                  className={`truncate ${selectedCharacter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {selectedCharacter
                    ? `${selectedCharacter.name}`
                    : hasCharacters
                      ? 'Select character'
                      : 'No characters available'}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className="h-4 w-4 text-gray-400"
                >
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ListboxButton>

              {hasCharacters && (
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-150"
                  enterFrom="opacity-0 translate-y-1"
                  enterTo="opacity-100 translate-y-0"
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100 translate-y-0"
                  leaveTo="opacity-0 -translate-y-1"
                >
                  <ListboxOptions className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white/95 p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-gray-700 dark:bg-gray-900/90 dark:ring-white/10">
                    {options.map(option => (
                      <ListboxOption
                        key={option.id}
                        value={option.id}
                        className={({ active, selected }) =>
                          `flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition ${
                            active
                              ? 'bg-gray-900/5 text-gray-900 dark:bg-white/10 dark:text-gray-100'
                              : 'text-gray-700 dark:text-gray-100'
                          } ${selected ? 'ring-1 ring-gray-400/60 ring-inset' : ''}`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <div className="flex w-full items-center justify-between gap-6">
                              <p className="font-medium">{option.name}</p>
                            </div>
                            <span
                              aria-hidden="true"
                              className={`text-base ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-transparent'}`}
                            >
                              ✓
                            </span>
                          </>
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Transition>
              )}
            </div>
          </Listbox>
          <Description className="text-xs text-gray-500 dark:text-gray-400">
            Choose the character this commission belongs to.
          </Description>
        </Field>

        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            File name
          </Label>
          <Input
            type="text"
            name="fileName"
            placeholder="20250302_Artist"
            required
            className={controlStyles}
          />
        </Field>
      </div>

      <Field className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
          Links (optional, one per line)
        </Label>
        <Textarea
          name="links"
          placeholder="https://example.com"
          rows={4}
          className={controlStyles}
        />
        <Description className="text-xs text-gray-500 dark:text-gray-400">
          Paste each URL on a separate line, or leave blank if none.
        </Description>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Design (optional)
          </Label>
          <Input
            type="text"
            name="design"
            placeholder="Design reference"
            className={controlStyles}
          />
        </Field>

        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Description (optional)
          </Label>
          <Input
            type="text"
            name="description"
            placeholder="Short description"
            className={controlStyles}
          />
        </Field>
      </div>

      <Field className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
          Keywords (optional, comma-separated, search-only)
        </Label>
        <Input
          type="text"
          name="keyword"
          placeholder="e.g. studio k, skeb, private tag"
          className={controlStyles}
        />
        <Description className="text-xs text-gray-500 dark:text-gray-400">
          Separate keywords with commas. They are searchable but never rendered publicly.
        </Description>
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <SubmitButton>Save commission</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to save commission."
          />
        </div>

        <Switch.Group as="div" className="ml-auto flex items-center gap-3">
          <Switch
            checked={isHidden}
            onChange={setIsHidden}
            className={`group relative inline-flex h-7 w-14 cursor-pointer items-center rounded-full p-1 transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${
              isHidden ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300/70 dark:bg-gray-700/70'
            }`}
          >
            <span className="sr-only">Hide commission from public list</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 translate-x-0 rounded-full bg-white shadow-lg transition duration-200 ease-out ${
                isHidden ? 'translate-x-7' : 'translate-x-0'
              } group-data-checked:translate-x-7 dark:bg-gray-900/80`}
            />
          </Switch>
          <Switch.Label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Hidden
          </Switch.Label>
        </Switch.Group>
      </div>

      {characterId !== null && <input type="hidden" name="characterId" value={characterId} />}
      {isHidden && <input type="hidden" name="hidden" value="on" />}
    </form>
  )
}

export default AddCommissionForm
