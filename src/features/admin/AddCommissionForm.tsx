import type { CharacterStatus } from '#lib/admin/db'
import type { ChangeEvent } from 'react'
import { addCommissionAction } from '#admin/actions'
import { useActionState, useEffect, useMemo, useState } from 'react'

import { isValidCommissionFileName } from './commissionFileName'
import {
  CommissionHiddenSwitch,
  CommissionSourceImageField,
} from './components/CommissionFormFields'
import CommissionSharedFields from './components/CommissionSharedFields'
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

type SourceImageHintTone = 'default' | 'success' | 'error'
const DEFAULT_SOURCE_IMAGE_HINT
  = 'Upload JPG/PNG. Source image is required and will be saved to data/images using this file name.'

function extractFileNameStem(fileName: string) {
  const trimmed = fileName.trim()
  const extIndex = trimmed.lastIndexOf('.')
  if (extIndex <= 0)
    return trimmed
  return trimmed.slice(0, extIndex)
}

function AddCommissionForm({ characters }: AddCommissionFormProps) {
  const [state, formAction] = useActionState(addCommissionAction, INITIAL_FORM_STATE)
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [isHidden, setIsHidden] = useState(false)
  const [fileName, setFileName] = useState('')
  const [sourceImageHint, setSourceImageHint] = useState(DEFAULT_SOURCE_IMAGE_HINT)
  const [sourceImageHintTone, setSourceImageHintTone] = useState<SourceImageHintTone>('default')

  useEffect(() => {
    if (state.status === 'success')
      notifyDataUpdate()
  }, [state.status])

  const options = useMemo(
    () => characters.toSorted((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const handleFileNameChange = (nextValue: string) => {
    setFileName(nextValue)
    if (sourceImageHintTone === 'error' && nextValue.trim()) {
      setSourceImageHint(
        'Uploaded file name does not match pattern. Manual value will be validated when saving.',
      )
      setSourceImageHintTone('default')
    }
  }

  const handleSourceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setSourceImageHint(DEFAULT_SOURCE_IMAGE_HINT)
      setSourceImageHintTone('default')
      return
    }

    const stem = extractFileNameStem(file.name)
    if (isValidCommissionFileName(stem)) {
      setFileName(stem)
      setSourceImageHint(`Detected "${stem}" from uploaded file name and auto-filled File name.`)
      setSourceImageHintTone('success')
      return
    }

    setSourceImageHint(
      'Uploaded file name does not match YYYYMMDD or YYYYMMDD_creator. Please fill File name manually.',
    )
    setSourceImageHintTone('error')
  }

  return (
    <form
      action={formAction}
      className="
        flex min-w-[20rem] flex-1 flex-col gap-5 rounded-2xl border
        border-gray-200 bg-white/90 p-6 shadow-sm ring-1 ring-gray-900/5
        backdrop-blur-sm
        dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10
      "
    >
      <div className="space-y-1">
        <h2 className="
          text-lg font-semibold text-gray-900
          dark:text-gray-100
        "
        >
          Add Commission Entry
        </h2>
        <p className="
          text-sm text-gray-600
          dark:text-gray-300
        "
        >
          Append a new commission record to an existing character. Links accept multiple lines.
        </p>
      </div>

      <CommissionSourceImageField
        required
        onChange={handleSourceImageChange}
        helperMessage={sourceImageHint}
        helperTone={sourceImageHintTone}
      />

      <CommissionSharedFields
        characterOptions={options}
        selectedCharacterId={characterId}
        onCharacterChange={setCharacterId}
        fileName={fileName}
        onFileNameChange={handleFileNameChange}
        fileNamePlaceholder="20250302_Artist"
        linksRows={3}
        designPlaceholder="Design reference"
        descriptionPlaceholder="Short description"
      />

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
