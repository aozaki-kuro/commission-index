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

function SourceImagePreview({ file }: { file: File | null }) {
  const imageRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!file || !imageRef.current)
      return
    const url = URL.createObjectURL(file)
    imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="flex aspect-1280/525 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
      {file
        ? <img ref={imageRef} alt="Cropped artwork ready to upload" className="size-full object-contain" />
        : <span className="text-xs text-gray-500 dark:text-gray-400">Artwork preview · 1280 × 525</span>}
    </div>
  )
}

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
      if (croppedImage)
        setFileInputValue(event.currentTarget, croppedImage)
      else
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
      onReset={(event) => {
        // React action 正常返回也会重置；业务失败必须保留草稿和已确认图片。
        if (state.status !== 'success')
          event.preventDefault()
        else
          setCroppedImage(null)
      }}
      className="
        admin-surface flex min-w-0 flex-1 flex-col gap-6 rounded-xl border
        border-gray-200 p-4 sm:p-6 dark:border-gray-800
      "
    >
      <section aria-label="Artwork" className="grid min-w-0 items-center gap-5 border-b border-gray-200 pb-6 @min-[40rem]/workspace:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] dark:border-gray-800">
        <SourceImagePreview file={croppedImage} />
        <div className="min-w-0">
          <CommissionSourceImageField
            required
            inputRef={sourceImageInputRef}
            onChange={handleSourceImageChange}
          />
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Entry details</h2>
        <button
          type="button"
          onClick={onAddCharacter}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-gray-600 underline underline-offset-4 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-gray-300 dark:hover:text-white"
        >
          New character
        </button>
      </div>

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
        visibilityControl={<CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />}
      />

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
