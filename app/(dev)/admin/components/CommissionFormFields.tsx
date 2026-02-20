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
import { Fragment, type ChangeEvent } from 'react'

const controlStyles =
  'w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100 dark:focus-visible:ring-offset-gray-900'

interface CharacterSelectOption {
  id: number
  name: string
}

interface CommissionCharacterFieldProps {
  options: CharacterSelectOption[]
  selectedCharacterId: number | null
  onChange: (id: number | null) => void
  disabled?: boolean
  dropdownZIndexClassName?: string
  showCheckmark?: boolean
}

export const CommissionCharacterField = ({
  options,
  selectedCharacterId,
  onChange,
  disabled = false,
  dropdownZIndexClassName = 'z-10',
  showCheckmark = false,
}: CommissionCharacterFieldProps) => {
  const selectedCharacter = options.find(option => option.id === selectedCharacterId) ?? null
  const hasCharacters = options.length > 0
  const isDisabled = disabled || !hasCharacters

  return (
    <Field className="space-y-1">
      <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
        Character
      </Label>
      <Listbox value={selectedCharacterId} onChange={onChange} disabled={isDisabled}>
        <div className="relative">
          <ListboxButton
            className={`${controlStyles} flex items-center justify-between ${isDisabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <span
              className={`truncate ${selectedCharacter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
            >
              {selectedCharacter
                ? selectedCharacter.name
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
              <ListboxOptions
                className={`absolute ${dropdownZIndexClassName} mt-2 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white/95 p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-gray-700 dark:bg-gray-900/90 dark:ring-white/10`}
              >
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
                        {showCheckmark ? (
                          <span
                            aria-hidden="true"
                            className={`text-base ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-transparent'}`}
                          >
                            ✓
                          </span>
                        ) : null}
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
  )
}

interface CommissionFileNameFieldProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

export const CommissionFileNameField = ({
  value,
  onChange,
  placeholder,
}: CommissionFileNameFieldProps) => {
  const controlled = value !== undefined && onChange

  return (
    <Field className="space-y-1">
      <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
        File name
      </Label>
      <Input
        type="text"
        name="fileName"
        required
        placeholder={placeholder}
        className={controlStyles}
        {...(controlled
          ? {
              value,
              onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
            }
          : {})}
      />
    </Field>
  )
}

interface CommissionLinksFieldProps {
  value?: string
  onChange?: (value: string) => void
  rows?: number
}

export const CommissionLinksField = ({ value, onChange, rows = 4 }: CommissionLinksFieldProps) => {
  const controlled = value !== undefined && onChange

  return (
    <Field className="space-y-1">
      <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
        Links (optional, one per line)
      </Label>
      <Textarea
        name="links"
        rows={rows}
        placeholder="https://example.com"
        className={controlStyles}
        {...(controlled
          ? {
              value,
              onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
            }
          : {})}
      />
      <Description className="text-xs text-gray-500 dark:text-gray-400">
        Paste each URL on a separate line, or leave blank if none.
      </Description>
    </Field>
  )
}

interface CommissionDesignDescriptionFieldsProps {
  designValue?: string
  onDesignChange?: (value: string) => void
  descriptionValue?: string
  onDescriptionChange?: (value: string) => void
  designPlaceholder?: string
  descriptionPlaceholder?: string
}

export const CommissionDesignDescriptionFields = ({
  designValue,
  onDesignChange,
  descriptionValue,
  onDescriptionChange,
  designPlaceholder,
  descriptionPlaceholder,
}: CommissionDesignDescriptionFieldsProps) => {
  const hasControlledDesign = designValue !== undefined && onDesignChange
  const hasControlledDescription = descriptionValue !== undefined && onDescriptionChange

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
          Design (optional)
        </Label>
        <Input
          type="text"
          name="design"
          placeholder={designPlaceholder}
          className={controlStyles}
          {...(hasControlledDesign
            ? {
                value: designValue,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  onDesignChange(event.target.value),
              }
            : {})}
        />
      </Field>

      <Field className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
          Description (optional)
        </Label>
        <Input
          type="text"
          name="description"
          placeholder={descriptionPlaceholder}
          className={controlStyles}
          {...(hasControlledDescription
            ? {
                value: descriptionValue,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  onDescriptionChange(event.target.value),
              }
            : {})}
        />
      </Field>
    </div>
  )
}

interface CommissionKeywordFieldProps {
  value?: string
  onChange?: (value: string) => void
}

export const CommissionKeywordField = ({ value, onChange }: CommissionKeywordFieldProps) => {
  const controlled = value !== undefined && onChange

  return (
    <Field className="space-y-1">
      <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
        Keywords (optional, comma-separated, search-only)
      </Label>
      <Input
        type="text"
        name="keyword"
        placeholder="e.g. studio k, skeb, private tag"
        className={controlStyles}
        {...(controlled
          ? {
              value,
              onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
            }
          : {})}
      />
      <Description className="text-xs text-gray-500 dark:text-gray-400">
        Separate keywords with commas. They are searchable but never rendered publicly.
      </Description>
    </Field>
  )
}

interface CommissionHiddenSwitchProps {
  isHidden: boolean
  onChange: (next: boolean) => void
}

export const CommissionHiddenSwitch = ({ isHidden, onChange }: CommissionHiddenSwitchProps) => {
  return (
    <Switch.Group as="div" className="flex items-center gap-3">
      <Switch
        checked={isHidden}
        onChange={onChange}
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
  )
}
