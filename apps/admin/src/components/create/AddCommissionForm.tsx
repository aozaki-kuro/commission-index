import type {
  AdminCommissionSearchRow,
  CharacterStatus,
} from '@commission-index/domain'
import type { ChangeEvent } from 'react'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { addCommissionAction } from '../../lib/adminActions'
import { isValidCommissionFileName } from '../../lib/commissionFileName'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { findDuplicateCommissionHints } from '../../lib/duplicateCommissionHints'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { isSupportedSourceImage, setFileInputValue } from '../../lib/imageCrop'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { FormStatusIndicator } from '../FormStatusIndicator'
import { ImageCropDialog } from '../image/ImageCropDialog'
import { SubmitButton } from '../SubmitButton'
import { CommissionHiddenSwitch, CommissionSourceImageField } from './CommissionFormFields'
import { CommissionSharedFields } from './CommissionSharedFields'
import { DuplicateCommissionNotice } from './DuplicateCommissionNotice'

interface CharacterOption {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
}

interface AddCommissionFormProps {
  characters: CharacterOption[]
  commissionSearchRows: AdminCommissionSearchRow[]
}

type SourceImageHintTone = 'default' | 'success' | 'error'

const DEFAULT_SOURCE_IMAGE_HINT
  = 'Choose a JPG/PNG, then position, zoom, and rotate it for the 1280×525 output.'

function extractFileNameStem(fileName: string) {
  const trimmed = fileName.trim()
  const extIndex = trimmed.lastIndexOf('.')

  if (extIndex <= 0) {
    return trimmed
  }

  return trimmed.slice(0, extIndex)
}

export function AddCommissionForm({
  characters,
  commissionSearchRows,
}: AddCommissionFormProps) {
  const [state, formAction] = useActionState(addCommissionAction, INITIAL_FORM_STATE)
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [isHidden, setIsHidden] = useState(false)
  const [fileName, setFileName] = useState('')
  const [keywordValue, setKeywordValue] = useState('')
  const [sourceImageHint, setSourceImageHint] = useState(DEFAULT_SOURCE_IMAGE_HINT)
  const [sourceImageHintTone, setSourceImageHintTone] = useState<SourceImageHintTone>('default')
  const [croppedImage, setCroppedImage] = useState<File | null>(null)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (state.status === 'success') {
      notifyDataUpdate()
      markPendingRebuild()
    }
  }, [state.status])

  const options = useMemo(
    () => characters.toSorted((left, right) => left.sortOrder - right.sortOrder),
    [characters],
  )

  const duplicateHints = useMemo(
    () =>
      findDuplicateCommissionHints({
        characterId,
        commissions: commissionSearchRows,
        fileName,
        keyword: keywordValue,
      }),
    [characterId, commissionSearchRows, fileName, keywordValue],
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
      return
    }

    if (!isSupportedSourceImage(file)) {
      event.currentTarget.value = ''
      setSourceImageHint('Choose a valid JPG or PNG image.')
      setSourceImageHintTone('error')
      return
    }

    setPendingCropFile(file)
  }

  const restoreCroppedImageSelection = () => {
    setPendingCropFile(null)
    const input = sourceImageInputRef.current
    if (!input) {
      return
    }

    if (croppedImage) {
      setFileInputValue(input, croppedImage)
      return
    }

    input.value = ''
  }

  const handleCropConfirm = (output: File) => {
    const input = sourceImageInputRef.current
    if (!input || !pendingCropFile) {
      return
    }

    try {
      setFileInputValue(input, output)
    }
    catch {
      input.value = ''
      setSourceImageHint('This browser could not attach the processed image to the form.')
      setSourceImageHintTone('error')
      setPendingCropFile(null)
      return
    }

    const originalFileName = pendingCropFile.name
    setCroppedImage(output)
    setPendingCropFile(null)

    const stem = extractFileNameStem(originalFileName)
    if (isValidCommissionFileName(stem)) {
      setFileName(stem)
      setSourceImageHint(`Ready: ${output.name} (1280×525 JPG). File name was detected as "${stem}".`)
      setSourceImageHintTone('success')
      return
    }

    setSourceImageHint(
      `Ready: ${output.name} (1280×525 JPG). Fill File name manually.`,
    )
    setSourceImageHintTone('success')
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
        inputRef={sourceImageInputRef}
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
        keywordValue={keywordValue}
        onKeywordChange={setKeywordValue}
      />

      <DuplicateCommissionNotice hints={duplicateHints} />

      <div className="
        flex flex-wrap items-center gap-4 border-t border-gray-200/60 pt-5
        dark:border-gray-700/60
      "
      >
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

      {pendingCropFile
        ? (
            <ImageCropDialog
              key={`${pendingCropFile.name}:${pendingCropFile.lastModified}`}
              file={pendingCropFile}
              onCancel={restoreCroppedImageSelection}
              onConfirm={handleCropConfirm}
            />
          )
        : null}
    </form>
  )
}
