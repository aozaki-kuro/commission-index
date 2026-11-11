import type {
  AdminCommissionSearchRow,
  CharacterStatus,
  CreatorAliasRow,
} from '@commission-index/domain'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import type { CropEditorState } from '../../lib/imageCrop'
import { IconCrop } from '@tabler/icons-react'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'
import { addCommissionAction } from '../../lib/adminActions'
import {
  buildFileNameSegmentContext,
  classifyFileNameSegments,
  extractCommissionDetails,
  resolveCharacterToken,
} from '../../lib/commissionFileDetails'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { findDuplicateCommissionHints } from '../../lib/duplicateCommissionHints'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { isSupportedSourceImage, setFileInputValue } from '../../lib/imageCrop'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { FloatingNotice } from '../FloatingNotice'
import { FormStatusIndicator } from '../FormStatusIndicator'
import { LazyImageCropDialog } from '../image/LazyImageCropDialog'
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
  creatorAliases: CreatorAliasRow[]
  bootstrapState: 'loading' | 'ready' | 'unavailable'
  onAddCharacter: () => void
  // notifyDataUpdate ignores the current tab, so the page must refresh its own bootstrap data.
  onCreated?: () => void
}

interface SourceImageNotice {
  tone: 'success' | 'error'
  message: string
}

// links/design/description are uncontrolled, so they are read from the form instead of state.
const UNCONTROLLED_DRAFT_FIELDS = ['links', 'design', 'description']
const EMPTY_DRAFT = JSON.stringify([null, false, '', '', '', '', ''])

function hasDraggedFiles(event: DragEvent) {
  return event.dataTransfer.types.includes('Files')
}

function SourceImagePreview({ file, isDropTarget, children }: { file: File | null, isDropTarget: boolean, children?: ReactNode }) {
  const imageRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!file || !imageRef.current)
      return
    const url = URL.createObjectURL(file)
    imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div
      className={`
        relative flex aspect-1280/525 items-center justify-center overflow-hidden rounded-md
        ${isDropTarget
      ? 'bg-gray-200 outline-2 -outline-offset-2 outline-gray-400 outline-dashed dark:bg-gray-700 dark:outline-gray-500'
      : 'bg-gray-100 dark:bg-gray-800'}
      `}
    >
      {file
        ? <img ref={imageRef} alt="Cropped artwork ready to upload" className="size-full object-contain" />
        : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isDropTarget ? 'Drop to crop' : 'Drop artwork here · 1280 × 525'}
            </span>
          )}
      {children}
    </div>
  )
}

export function AddCommissionForm({
  characters,
  commissionSearchRows,
  creatorAliases,
  bootstrapState,
  onAddCharacter,
  onCreated,
}: AddCommissionFormProps) {
  const [state, formAction] = useActionState(addCommissionAction, INITIAL_FORM_STATE)
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [isHidden, setIsHidden] = useState(false)
  const [commissionDate, setCommissionDate] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [workGroupId, setWorkGroupId] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [keywordValue, setKeywordValue] = useState('')
  const [sourceImageNotice, setSourceImageNotice] = useState<SourceImageNotice | null>(null)
  const [croppedImage, setCroppedImage] = useState<File | null>(null)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  // The original pick, kept so the crop can be redone without re-cropping the lossy 1280×525 output.
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  // The frame confirmed for sourceFile, so "Edit image" reopens where the last crop left off.
  const [sourceCropState, setSourceCropState] = useState<CropEditorState | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  // dragenter/dragleave fire for every child element; only the outermost pair toggles the highlight.
  const dragDepthRef = useRef(0)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [hasTextDraft, setHasTextDraft] = useState(false)
  const [savedDraft, setSavedDraft] = useState(EMPTY_DRAFT)
  // Controlled fields survive a successful reset, so dirty is measured against the last saved values.
  const controlledDraft = JSON.stringify([
    characterId,
    isHidden,
    commissionDate,
    creatorName,
    workGroupId,
    partNumber,
    keywordValue,
  ])
  useUnsavedChangesGuard(controlledDraft !== savedDraft || hasTextDraft || croppedImage !== null || pendingCropFile !== null)

  // Latest callback via ref so a new identity while still in 'success' cannot re-fire the effect.
  const onCreatedRef = useRef(onCreated)
  useEffect(() => {
    onCreatedRef.current = onCreated
  })

  useEffect(() => {
    if (state.status === 'success') {
      notifyDataUpdate()
      markPendingRebuild()
      onCreatedRef.current?.()
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
        partNumber: partNumber
          ? Number(partNumber)
          : null,
        keyword: keywordValue,
      }),
    [
      characterId,
      commissionDate,
      commissionSearchRows,
      creatorName,
      keywordValue,
      workGroupId,
      partNumber,
    ],
  )

  const rejectUnsupportedSourceImage = () => {
    setSourceImageNotice({ tone: 'error', message: 'Choose a valid JPG or PNG image.' })
  }

  // The file input only ever holds the confirmed crop output; anything else picked is put back.
  const restoreFileInput = (input: HTMLInputElement) => {
    if (croppedImage)
      setFileInputValue(input, croppedImage)
    else
      input.value = ''
  }

  const handleSourceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!isSupportedSourceImage(file)) {
      restoreFileInput(event.currentTarget)
      rejectUnsupportedSourceImage()
      return
    }

    setPendingCropFile(file)
  }

  const handleArtworkDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event))
      return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDropTarget(true)
  }

  const handleArtworkDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event))
      return
    // Without preventDefault the browser navigates to the dropped file and drops the draft.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleArtworkDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event))
      return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0)
      setIsDropTarget(false)
  }

  // A drop bypasses the file input: the input only ever holds the confirmed crop output.
  const handleArtworkDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event))
      return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDropTarget(false)
    const file = event.dataTransfer.files[0]
    if (!file || pendingCropFile)
      return
    if (!isSupportedSourceImage(file)) {
      rejectUnsupportedSourceImage()
      return
    }
    setPendingCropFile(file)
  }

  const restoreCroppedImageSelection = () => {
    setPendingCropFile(null)
    if (sourceImageInputRef.current)
      restoreFileInput(sourceImageInputRef.current)
  }

  const handleCropConfirm = (output: File, editorState: CropEditorState | null) => {
    const input = sourceImageInputRef.current
    const source = pendingCropFile
    if (!input || !source) {
      return
    }

    setPendingCropFile(null)
    try {
      setFileInputValue(input, output)
    }
    catch {
      input.value = ''
      setSourceImageNotice({
        tone: 'error',
        message: 'This browser could not attach the processed image to the form.',
      })
      return
    }

    setCroppedImage(output)
    setSourceFile(source)
    setSourceCropState(editorState)

    // Re-cropping the retained source must not overwrite details typed since the first crop.
    if (source === sourceFile) {
      setSourceImageNotice({ tone: 'success', message: 'Image updated (1280×525 JPG).' })
      return
    }

    const details = extractCommissionDetails(source.name)
    if (!details) {
      setSourceImageNotice({
        tone: 'success',
        message: `Ready: ${output.name} (1280×525 JPG). Add delivery details if known.`,
      })
      return
    }

    const classified = details.segments.length > 0
      ? classifyFileNameSegments(details.segments, buildFileNameSegmentContext(commissionSearchRows, creatorAliases))
      : { creatorName: details.creatorName, keyword: '' }
    const character = details.characterToken
      ? resolveCharacterToken(details.characterToken, options)
      : null
    setCommissionDate(details.commissionDate)
    setCreatorName(classified.creatorName)
    // Character, keyword and part only fill fields that are still empty.
    if (character)
      setCharacterId(current => current ?? character.id)
    if (classified.keyword) {
      setKeywordValue(current => current.trim()
        ? current
        : classified.keyword)
    }
    if (!workGroupId)
      setPartNumber(current => current || details.partNumber?.toString() || '')
    setSourceImageNotice({
      tone: 'success',
      message: details.partNumber
        ? `Image ready (1280×525 JPG). Details were suggested; enable part grouping to use part ${details.partNumber}.`
        : 'Image ready (1280×525 JPG). Delivery details were suggested from the image name.',
    })
  }

  return (
    <form
      action={formAction}
      onInput={(event) => {
        const data = new FormData(event.currentTarget)
        setHasTextDraft(UNCONTROLLED_DRAFT_FIELDS.some(name => String(data.get(name) ?? '').trim() !== ''))
      }}
      onReset={(event) => {
        // React action 正常返回也会重置；业务失败必须保留草稿和已确认图片。
        if (state.status !== 'success') {
          event.preventDefault()
        }
        else {
          setCroppedImage(null)
          setSourceFile(null)
          setSourceCropState(null)
          setHasTextDraft(false)
          setSavedDraft(controlledDraft)
        }
      }}
      className="
        admin-surface flex min-w-0 flex-1 flex-col gap-6 rounded-xl border
        border-gray-200 p-4 sm:p-6 dark:border-gray-800
      "
    >
      <section
        aria-label="Artwork"
        onDragEnter={handleArtworkDragEnter}
        onDragOver={handleArtworkDragOver}
        onDragLeave={handleArtworkDragLeave}
        onDrop={handleArtworkDrop}
        className="grid min-w-0 items-center gap-5 border-b border-gray-200 pb-6 @min-[40rem]/workspace:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] dark:border-gray-800"
      >
        <SourceImagePreview file={croppedImage} isDropTarget={isDropTarget}>
          {croppedImage && sourceFile
            ? (
                <button
                  type="button"
                  onClick={() => setPendingCropFile(sourceFile)}
                  disabled={pendingCropFile !== null}
                  aria-label="Edit image"
                  title="Edit image"
                  className="
                    absolute right-3 bottom-3 inline-flex size-11 items-center
                    justify-center rounded-full border border-white/20 bg-black/55
                    text-white transition
                    hover:bg-black/70
                    focus-visible:outline-2 focus-visible:outline-offset-2
                    focus-visible:outline-white
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                >
                  <IconCrop className="size-4" stroke={1.8} aria-hidden="true" />
                </button>
              )
            : null}
        </SourceImagePreview>
        <div className="min-w-0">
          <CommissionSourceImageField
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

      {sourceImageNotice
        ? (
            <FloatingNotice tone={sourceImageNotice.tone} onDismiss={() => setSourceImageNotice(null)}>
              {sourceImageNotice.message}
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
        designPlaceholder="Design reference"
        descriptionPlaceholder="Short description"
        keywordValue={keywordValue}
        onKeywordChange={setKeywordValue}
        visibilityControl={<CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />}
      />

      <DuplicateCommissionNotice hints={duplicateHints} />

      <div className="mt-2 flex min-w-0 border-t border-gray-200 pt-6 dark:border-gray-800">
        <SubmitButton disabled={bootstrapState !== 'ready'}>Save commission</SubmitButton>
        <FormStatusIndicator
          status={state.status}
          message={state.message}
          errorFallback="Unable to save commission."
        />
      </div>

      {pendingCropFile
        ? (
            <LazyImageCropDialog
              key={`${pendingCropFile.name}:${pendingCropFile.lastModified}`}
              file={pendingCropFile}
              initialEditorState={pendingCropFile === sourceFile
                ? sourceCropState ?? undefined
                : undefined}
              onCancel={restoreCroppedImageSelection}
              onConfirm={handleCropConfirm}
            />
          )
        : null}
    </form>
  )
}
