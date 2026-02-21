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
  Transition,
} from '@headlessui/react'
import { Fragment, useActionState, useEffect, useMemo, useState } from 'react'

import { addCharacterAction } from '#admin/actions'
import { notifyDataUpdate } from './dataUpdateSignal'
import FormStatusIndicator from './FormStatusIndicator'
import SubmitButton from './SubmitButton'
import { INITIAL_FORM_STATE } from './types'
import { formControlStyles } from './uiStyles'

type StatusValue = 'active' | 'stale'

const statusOptions: Array<{ value: StatusValue; label: string }> = [
  {
    value: 'active',
    label: 'Active',
  },
  {
    value: 'stale',
    label: 'Stale',
  },
]

const AddCharacterForm = () => {
  const [state, formAction] = useActionState(addCharacterAction, INITIAL_FORM_STATE)
  const [status, setStatus] = useState<StatusValue>('active')

  useEffect(() => {
    if (state.status === 'success') notifyDataUpdate()
  }, [state.status])

  const currentStatus = useMemo(
    () => statusOptions.find(option => option.value === status) ?? statusOptions[0],
    [status],
  )

  return (
    <form
      action={formAction}
      className="flex min-w-[20rem] flex-1 flex-col gap-5 rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm ring-1 ring-gray-900/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Character</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Register a new character to start tracking commissions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Name
          </Label>
          <Input
            type="text"
            name="name"
            placeholder="Character name"
            required
            className={formControlStyles}
          />
        </Field>

        <Field className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Status
          </Label>
          <Listbox value={status} onChange={setStatus}>
            <div className="relative">
              <ListboxButton className={`${formControlStyles} flex items-center justify-between`}>
                <span className="truncate text-gray-900 dark:text-gray-100">
                  {currentStatus.label}
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

              <Transition
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 -translate-y-1"
              >
                <ListboxOptions className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white/95 p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-gray-700 dark:bg-gray-900/90 dark:ring-white/10">
                  {statusOptions.map(option => (
                    <ListboxOption
                      key={option.value}
                      value={option.value}
                      className={({ active, selected }) =>
                        `flex cursor-pointer items-start justify-between gap-3 rounded-md px-3 py-2 text-sm transition ${
                          active
                            ? 'bg-gray-900/5 text-gray-900 dark:bg-white/10 dark:text-gray-100'
                            : 'text-gray-700 dark:text-gray-100'
                        } ${selected ? 'ring-1 ring-gray-400/60 ring-inset' : ''}`
                      }
                    >
                      <p className="font-medium">{option.label}</p>
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Transition>
            </div>
          </Listbox>
          <Description className="text-xs text-gray-500 dark:text-gray-400">
            This controls where the character appears on the public roster.
          </Description>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <SubmitButton>Save character</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to save character."
          />
        </div>
      </div>

      <input type="hidden" name="status" value={status} />
    </form>
  )
}

export default AddCharacterForm
