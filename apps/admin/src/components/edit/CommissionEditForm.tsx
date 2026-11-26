import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import type { ChangeEvent } from 'react'
import type { FormState } from '../../lib/formState'
import { IconTrash, IconUpload } from '@tabler/icons-react'
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { buttonStyles } from '../../app/ui'
import { useCommissionEditState } from '../../hooks/useCommissionEditState'
import { useToast } from '../../hooks/useToast'
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'
import {
  deleteCommissionAction,
  replaceCommissionSourceImageAction,
  updateCommissionAction,
} from '../../lib/adminActions'
import {
  formatCommissionPublicId,
  getCommissionAccessibleLabel,
  getCommissionTitle,
} from '../../lib/commissionPresentation'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { findDuplicateCommissionHints } from '../../lib/duplicateCommissionHints'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { isSupportedSourceImage } from '../../lib/imageCrop'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import {
  getCommissionSourceImageUrl,
  publishPreviewImageVersion,
  readPreviewImageVersion,
} from '../../lib/sourceImagePreview'
import { CommissionHiddenSwitch } from '../create/CommissionFormFields'
import { CommissionSharedFields } from '../create/CommissionSharedFields'
import { DuplicateCommissionNotice } from '../create/DuplicateCommissionNotice'
import { DialogNoticeSlot, FloatingNotice } from '../FloatingNotice'
import { FormStatusIndicator } from '../FormStatusIndicator'
import { LazyImageCropDialog } from '../image/LazyImageCropDialog'
import { SubmitButton } from '../SubmitButton'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

interface CommissionEditFormProps {
  characters: CharacterRow[]
  commission: CommissionRow
  commissionSearchRows: AdminCommissionSearchRow[]
  onCancel?: () => void
  onDelete?: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onSaveSuccess?: (updated: CommissionRow) => void
}

// Normalised like saveCommission's payload so a saved draft compares equal to its baseline.
function buildDraftSnapshot(draft: {
  characterId: number
  hidden: boolean
  commissionDate: string
  creatorName: string
  workGroupId: string
  partNumber: string
  links: string
  design: string
  description: string
  keyword: string
}) {
  const trim = (value: string) => value.trim()
  return JSON.stringify([
    draft.characterId,
    draft.hidden,
    trim(draft.commissionDate),
    trim(draft.creatorName),
    trim(draft.workGroupId),
    // Number input keeps "01"/"1.0" as typed; normalise so it matches the saved numeric baseline.
    trim(draft.partNumber) === ''
      ? ''
      : String(Number(draft.partNumber)),
    draft.links.split('\n').map(trim).filter(Boolean),
    trim(draft.design),
    trim(draft.description),
    trim(draft.keyword),
  ])
}

export function CommissionEditForm({
  characters,
  commission,
  commissionSearchRows,
  onCancel,
  onDelete,
  onDirtyChange,
  onSaveSuccess,
}: CommissionEditFormProps) {
  const toast = useToast()
  const [state, formAction, isSaving] = useActionState(saveCommission, INITIAL_FORM_STATE)
  const [isDeleting, startDelete] = useTransition()
  const [isUploading, startUpload] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const [workGroupId, setWorkGroupId] = useState(commission.workGroupId ?? '')
  const [partNumber, setPartNumber] = useState(commission.partNumber?.toString() ?? '')
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [imageVersion, setImageVersion] = useState(() => readPreviewImageVersion(commission.id))
  const {
    commissionDate,
    creatorName,
    descriptionValue,
    designValue,
    errorSrc,
    imageSrc,
    initialCharacterId,
    isHidden,
    keywordValue,
    linksValue,
    selectedCharacterId,
    setCommissionDate,
    setCreatorName,
    setDescriptionValue,
    setDesignValue,
    setErrorSrc,
    setIsHidden,
    setKeywordValue,
    setLinksValue,
    setSelectedCharacterId,
    sortedCharacters,
  } = useCommissionEditState({
    characters,
    commission,
  })
  const draftSnapshot = buildDraftSnapshot({
    characterId: selectedCharacterId,
    hidden: isHidden,
    commissionDate,
    creatorName,
    workGroupId,
    partNumber,
    links: linksValue,
    design: designValue,
    description: descriptionValue,
    keyword: keywordValue,
  })
  const [savedSnapshot, setSavedSnapshot] = useState(draftSnapshot)
  const isDirty = draftSnapshot !== savedSnapshot || pendingCropFile !== null
  useUnsavedChangesGuard(isDirty)
  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])
  const previewImageSrc = getCommissionSourceImageUrl(commission.id, imageVersion)
  const accessibleLabel = getCommissionAccessibleLabel(commission)
  const duplicateHints = useMemo(
    () => findDuplicateCommissionHints({
      characterId: selectedCharacterId,
      commissionId: commission.id,
      commissions: commissionSearchRows,
      commissionDate: commissionDate || null,
      creatorName,
      workGroupId,
      partNumber: partNumber
        ? Number(partNumber)
        : null,
      keyword: keywordValue,
    }),
    [
      commission.id,
      commissionDate,
      commissionSearchRows,
      creatorName,
      keywordValue,
      partNumber,
      selectedCharacterId,
      workGroupId,
    ],
  )

  async function saveCommission(previous: FormState, payload: FormData): Promise<FormState> {
    // 回调只反映本次提交；等待响应期间继续输入的草稿不应冒充已保存数据。
    const field = (name: string) => payload.get(name)?.toString().trim() ?? ''
    const requestedGroupId = field('workGroupId')
    const savedGroupId = requestedGroupId === 'new'
      ? crypto.randomUUID()
      : requestedGroupId
    payload.set('workGroupId', savedGroupId)
    const characterId = Number(field('characterId'))
    // A move changes both groups; capture the origin before awaiting because the prop may update meanwhile.
    // Limit: a stale tab's origin can miss the group another tab moved the work into; that group refreshes on the next unscoped refresh.
    const affectedCharacterIds = [commission.characterId, characterId]
    const updated: CommissionRow = {
      ...commission,
      characterId,
      characterName: sortedCharacters.find(character => character.id === characterId)?.name ?? commission.characterName,
      commissionDate: field('commissionDate') || null,
      creatorName: field('creatorName') || null,
      workGroupId: savedGroupId || null,
      partNumber: field('partNumber')
        ? Number(field('partNumber'))
        : null,
      description: field('description') || null,
      design: field('design') || null,
      hidden: field('hidden') === 'on',
      keyword: field('keyword') || null,
      links: field('links').split('\n').map(link => link.trim()).filter(Boolean),
    }
    let result: FormState
    try {
      result = await updateCommissionAction(previous, payload)
    }
    catch {
      return { status: 'error', message: 'Unable to update commission.' }
    }
    if (result.status === 'success') {
      setWorkGroupId(current => current === requestedGroupId
        ? savedGroupId
        : current)
      notifyDataUpdate({ characterIds: affectedCharacterIds })
      markPendingRebuild()
      setSavedSnapshot(buildDraftSnapshot({
        characterId: updated.characterId,
        hidden: updated.hidden,
        commissionDate: updated.commissionDate ?? '',
        creatorName: updated.creatorName ?? '',
        workGroupId: updated.workGroupId ?? '',
        partNumber: updated.partNumber?.toString() ?? '',
        links: updated.links.join('\n'),
        design: updated.design ?? '',
        description: updated.description ?? '',
        keyword: updated.keyword ?? '',
      }))
      onSaveSuccess?.(updated)
    }
    return result
  }

  const handleConfirmDelete = () => {
    const characterIds = [commission.characterId]
    setDeleteError(null)
    startDelete(() => {
      return deleteCommissionAction(commission.id)
        .then((result) => {
          if (result.status === 'success') {
            notifyDataUpdate({ characterIds })
            markPendingRebuild()
            toast.push({
              id: `delete-commission:${commission.id}`,
              tone: 'success',
              message: 'Entry deleted.',
            })
            setIsDeleteDialogOpen(false)
            onDelete?.()
            return
          }

          setIsDeleteDialogOpen(false)
          setDeleteError(result.message ?? 'Failed to delete commission.')
        })
        .catch(() => {
          setIsDeleteDialogOpen(false)
          setDeleteError('Failed to delete commission.')
        })
    })
  }

  const clearSourceImageInput = () => {
    if (sourceImageInputRef.current) {
      sourceImageInputRef.current.value = ''
    }
  }

  const handleSelectSourceImage = () => {
    sourceImageInputRef.current?.click()
  }

  const handleSourceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) {
      return
    }

    if (!isSupportedSourceImage(file)) {
      setUploadError('Choose a valid JPG or PNG image.')
      input.value = ''
      return
    }

    setUploadError(null)
    setPendingCropFile(file)
  }

  const uploadSourceImage = (file: File) => {
    const payload = new FormData()
    payload.set('id', String(commission.id))
    payload.set('sourceImage', file)
    const characterIds = [commission.characterId]
    setUploadError(null)

    startUpload(() => {
      return replaceCommissionSourceImageAction(payload)
        .then((result) => {
          if (result.status === 'success') {
            const nextVersion = Date.now()
            notifyDataUpdate({ characterIds })
            markPendingRebuild()
            toast.push({
              id: `replace-source-image:${commission.id}`,
              tone: 'success',
              message: result.message ?? `Source image for commission #${formatCommissionPublicId(commission.publicId)} replaced.`,
            })
            setErrorSrc(null)
            setImageVersion(nextVersion)
            publishPreviewImageVersion(commission.id, nextVersion)
            return
          }

          setUploadError(result.message ?? 'Failed to replace source image.')
        })
        .catch(() => {
          setUploadError('Failed to replace source image.')
        })
        .finally(clearSourceImageInput)
    })
  }

  const handleCropCancel = () => {
    setPendingCropFile(null)
    clearSourceImageInput()
  }

  const handleCropConfirm = (file: File) => {
    setPendingCropFile(null)
    uploadSourceImage(file)
  }

  return (
    <form
      action={formAction}
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="id" value={commission.id} />
      <input type="hidden" name="characterId" value={selectedCharacterId} />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
        <div className="
          group relative aspect-1280/525 w-full overflow-hidden rounded-xl
          bg-gray-50
          dark:bg-gray-900/30
        "
        >
          {errorSrc === imageSrc
            ? (
                <div className="
                  flex size-full items-center justify-center text-xs text-gray-500
                  dark:text-gray-300
                "
                >
                  Image not found
                </div>
              )
            : (
                <img
                  src={previewImageSrc}
                  alt={`Source image for ${accessibleLabel}`}
                  loading="lazy"
                  className="size-full object-contain"
                  onError={() => setErrorSrc(imageSrc)}
                />
              )}

          <input
            ref={sourceImageInputRef}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleSourceImageChange}
          />

          <button
            type="button"
            onClick={handleSelectSourceImage}
            disabled={isDeleting || isUploading || isSaving}
            aria-label={`Reupload source image for ${accessibleLabel}`}
            title={`Public ID: ${commission.publicId}`}
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
            <IconUpload className="size-4" stroke={1.8} aria-hidden="true" />
          </button>
        </div>

        {pendingCropFile
          ? (
              <LazyImageCropDialog
                key={`${pendingCropFile.name}:${pendingCropFile.lastModified}`}
                file={pendingCropFile}
                onCancel={handleCropCancel}
                onConfirm={handleCropConfirm}
              />
            )
          : null}

        <CommissionSharedFields
          characterOptions={sortedCharacters}
          selectedCharacterId={selectedCharacterId}
          onCharacterChange={id => setSelectedCharacterId(id ?? initialCharacterId)}
          commissionDate={commissionDate}
          onCommissionDateChange={setCommissionDate}
          commissionSearchRows={commissionSearchRows}
          workGroupId={workGroupId}
          onWorkGroupIdChange={setWorkGroupId}
          partNumber={partNumber}
          onPartNumberChange={setPartNumber}
          creatorName={creatorName}
          onCreatorNameChange={setCreatorName}
          linksValue={linksValue}
          onLinksChange={setLinksValue}
          designValue={designValue}
          onDesignChange={setDesignValue}
          descriptionValue={descriptionValue}
          onDescriptionChange={setDescriptionValue}
          keywordValue={keywordValue}
          onKeywordChange={setKeywordValue}
          visibilityControl={<CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />}
        />

        <DuplicateCommissionNotice hints={duplicateHints} />
      </div>

      <DialogNoticeSlot />

      <FormStatusIndicator
        status={state.status}
        message={state.message}
        errorFallback="Unable to update commission."
      />
      {uploadError
        ? (
            <FloatingNotice tone="error" onDismiss={() => setUploadError(null)}>
              {uploadError}
            </FloatingNotice>
          )
        : null}
      {deleteError
        ? (
            <FloatingNotice tone="error" onDismiss={() => setDeleteError(null)}>
              {deleteError}
            </FloatingNotice>
          )
        : null}

      <footer className="
        flex shrink-0 flex-wrap items-center justify-between gap-3 border-t
        border-gray-200 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]
        dark:border-gray-800
        sm:pb-4
      "
      >
        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={isDeleting || isUploading || isSaving}
          className={`${buttonStyles.ghostDanger} -ml-2 shrink-0`}
        >
          <IconTrash className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
          <span>Delete</span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {onCancel
            ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isDeleting}
                  className={`${buttonStyles.secondary} min-w-20 shrink-0`}
                >
                  Cancel
                </button>
              )
            : null}
          <SubmitButton disabled={isDeleting || isUploading}>Save changes</SubmitButton>
        </div>
      </footer>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isDeleting) {
            setIsDeleteDialogOpen(false)
          }
        }}
      >
        <DialogContent
          role="alertdialog"
          aria-modal="true"
          variant="alert"
          className="max-w-md p-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelDeleteButtonRef.current?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (isDeleting) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (isDeleting) {
              event.preventDefault()
            }
          }}
        >
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Delete commission?
          </DialogTitle>
          <div className="mt-2 space-y-2">
            <DialogDescription>
              This will permanently remove this commission and its source image. This action cannot be undone.
            </DialogDescription>
            <p className="text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold">{getCommissionTitle(commission)}</span>
              {' · '}
              <span>{commission.characterName}</span>
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              ref={cancelDeleteButtonRef}
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className={buttonStyles.secondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className={buttonStyles.danger}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  )
}
