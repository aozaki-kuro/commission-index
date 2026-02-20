'use client'

import {
  CommissionCharacterField,
  CommissionDesignDescriptionFields,
  CommissionFileNameField,
  CommissionHiddenSwitch,
  CommissionKeywordField,
  CommissionLinksField,
} from './components/CommissionFormFields'
import { useActionState, useEffect, useMemo, useState } from 'react'

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
        <CommissionCharacterField
          options={options}
          selectedCharacterId={characterId}
          onChange={setCharacterId}
          showCheckmark
        />
        <CommissionFileNameField placeholder="20250302_Artist" />
      </div>

      <CommissionLinksField rows={4} />

      <CommissionDesignDescriptionFields
        designPlaceholder="Design reference"
        descriptionPlaceholder="Short description"
      />

      <CommissionKeywordField />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <SubmitButton>Save commission</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to save commission."
          />
        </div>

        <div className="ml-auto">
          <CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />
        </div>
      </div>

      {characterId !== null && <input type="hidden" name="characterId" value={characterId} />}
      {isHidden && <input type="hidden" name="hidden" value="on" />}
    </form>
  )
}

export default AddCommissionForm
