import type {
  AdminCommissionSearchRow,
  CharacterStatus,
} from '@commission-index/domain'
import type { ChangeEvent } from 'react'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { addCommissionAction } from '../../lib/adminActions'
import { extractCommissionDetails } from '../../lib/commissionFileDetails'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { findDuplicateCommissionHints } from '../../lib/duplicateCommissionHints'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { isSupportedSourceImage, setFileInputValue } from '../../lib/imageCrop'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { FloatingNotice } from '../FloatingNotice'
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
  bootstrapState: 'loading' | 'ready' | 'unavailable'
  onAddCharacter: () => void
}

type SourceImageHintTone = 'default' | 'success' | 'error'

export function AddCommissionForm({
  characters,
  commissionSearchRows,
  bootstrapState,
  onAddCharacter,
}: AddCommissionFormProps) {
  const [state, formAction] = useActionState(addCommissionAction, INITIAL_FORM_STATE)
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [isHidden, setIsHidden] = useState(false)
  const [commissionDate, setCommissionDate] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [workGroupId, setWorkGroupId] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [keywordValue, setKeywordValue] = useState('')
  const [sourceImageHint, setSourceImageHint] = useState('')
  const [sourceImageHintTone, setSourceImageHintTone] = useState<SourceImageHintTone>('default')
  const [croppedImage, setCroppedImage] = useState<File | null>(null)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (state.status === 'success') {
      notifyDataUpdate()
      markPendingRebuild()
    }
  }, [state])

  const options = useMemo(
    () => characters.toSorted((left, right) => left.sortOrder - right.sortOrder),
    [characters],
  )

  const duplicateHints = useMemo(
    () =>
      findDuplicateCommissionHints({
        characterId,
        commissions: commissionSearchRows,
        commissionDate: commissionDate || null,
        creatorName,
        workGroupId: workGroupId || null,
        partNumber: partNumber ? Number(partNumber) : null,
        keyword: keywordValue,
      }),
    [characterId, commissionDate, commissionSearchRows, creatorName, keywordValue, workGroupId, partNumber],
  )

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

    const detectedDetails = extractCommissionDetails(originalFileName)
    if (detectedDetails) {
      setCommissionDate(detectedDetails.commissionDate)
      setCreatorName(detectedDetails.creatorName)
      if (!workGroupId) {
        setPartNumber(current => current || detectedDetails.partNumber?.toString() || '')
      }
      setSourceImageHint(
        detectedDetails.partNumber
          ? `Image ready (1280×525 JPG). Details were suggested; enable part grouping to use part ${detectedDetails.partNumber}.`
          : 'Image ready (1280×525 JPG). Delivery details were suggested from the image name.',
      )
      setSourceImageHintTone('success')
      return
    }

    setSourceImageHint(`Ready: ${output.name} (1280×525 JPG). Add delivery details if known.`)
    setSourceImageHintTone('success')
  }

  return (
    <form
      action={formAction}
      className="
        flex min-w-0 flex-1 flex-col gap-5 rounded-2xl border
        border-gray-200 bg-white/90 p-6 shadow-sm ring-1 ring-gray-900/5
        backdrop-blur-sm
        dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10
      "
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
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
            Add artwork and its delivery details.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddCharacter}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-gray-600 underline underline-offset-4 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-gray-300 dark:hover:text-white"
        >
          New character
        </button>
      </div>

      <CommissionSourceImageField
        required
        inputRef={sourceImageInputRef}
        onChange={handleSourceImageChange}
      />
      {sourceImageHint
        ? (
            <FloatingNotice tone={sourceImageHintTone === 'error' ? 'error' : 'success'} onDismiss={() => setSourceImageHint('')}>
              {sourceImageHint}
            </FloatingNotice>
          )
        : null}

      <CommissionSharedFields
        characterOptions={options}
        characterDataState={bootstrapState}
        selectedCharacterId={characterId}
        onCharacterChange={setCharacterId}
        commissionSearchRows={commissionSearchRows}
        workGroupId={workGroupId}
        onWorkGroupIdChange={setWorkGroupId}
        partNumber={partNumber}
        onPartNumberChange={setPartNumber}
        commissionDate={commissionDate}
        onCommissionDateChange={setCommissionDate}
        creatorName={creatorName}
        onCreatorNameChange={setCreatorName}
        linksRows={3}
        designPlaceholder="Design reference"
        descriptionPlaceholder="Short description"
        keywordValue={keywordValue}
        onKeywordChange={setKeywordValue}
      />

      <CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />

      <DuplicateCommissionNotice hints={duplicateHints} />

      <div className="
        mt-2 flex min-w-0 flex-wrap items-center gap-4 border-t border-gray-200/60 pt-6
        dark:border-gray-700/60
      "
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SubmitButton disabled={bootstrapState !== 'ready'}>Save commission</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to save commission."
          />
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
