import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import type { ChangeEvent } from 'react'
import type { FormState } from '../../lib/formState'
import { IconUpload } from '@tabler/icons-react'
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useCommissionEditState } from '../../hooks/useCommissionEditState'
import {
  deleteCommissionAction,
  replaceCommissionSourceImageAction,
  updateCommissionAction,
} from '../../lib/adminActions'
import { getCommissionAccessibleLabel } from '../../lib/commissionPresentation'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { findDuplicateCommissionHints } from '../../lib/duplicateCommissionHints'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { isSupportedSourceImage } from '../../lib/imageCrop'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { CommissionHiddenSwitch } from '../create/CommissionFormFields'
import { CommissionSharedFields } from '../create/CommissionSharedFields'
import { DuplicateCommissionNotice } from '../create/DuplicateCommissionNotice'
import { FloatingNotice } from '../FloatingNotice'
import { FormStatusIndicator } from '../FormStatusIndicator'
import { LazyImageCropDialog } from '../image/LazyImageCropDialog'
import { SubmitButton } from '../SubmitButton'

interface CommissionEditFormProps {
  characters: CharacterRow[]
  commission: CommissionRow
  commissionSearchRows: AdminCommissionSearchRow[]
  onDelete?: () => void
  onSaveSuccess?: (updated: CommissionRow) => void
}

interface OperationStatus {
  text: string
  type: 'success' | 'error'
}

function buildPreviewVersionStorageKey(commissionId: number) {
  return `admin-preview-image-version:${commissionId}`
}

export function CommissionEditForm({
  characters,
  commission,
  commissionSearchRows,
  onDelete,
  onSaveSuccess,
}: CommissionEditFormProps) {
  const [state, formAction, isSaving] = useActionState(saveCommission, INITIAL_FORM_STATE)
  const [isDeleting, startDelete] = useTransition()
  const [isUploading, startUpload] = useTransition()
  const [uploadStatus, setUploadStatus] = useState<OperationStatus | null>(null)
  const [isDeleteArmed, setIsDeleteArmed] = useState(false)
  const [workGroupId, setWorkGroupId] = useState(commission.workGroupId ?? '')
  const [partNumber, setPartNumber] = useState(commission.partNumber?.toString() ?? '')
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [imageVersion, setImageVersion] = useState(() => {
    if (typeof window === 'undefined') {
      return 0
    }

    const stored = window.sessionStorage.getItem(buildPreviewVersionStorageKey(commission.id))
    const parsed = Number(stored)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })
  const {
    commissionDate,
    creatorName,
    deleteStatus,
    descriptionValue,
    designValue,
    errorSrc,
    imageSrc,
    initialCharacterId,
    isHidden,
    keywordValue,
    linksValue,
    selectedCharacterId,
    setDeleteStatus,
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
  const previewImageSrc = imageVersion > 0 ? `${imageSrc}?v=${imageVersion}` : imageSrc
  const accessibleLabel = getCommissionAccessibleLabel(commission)
  const duplicateHints = useMemo(
    () => findDuplicateCommissionHints({
      characterId: selectedCharacterId,
      commissionId: commission.id,
      commissions: commissionSearchRows,
      commissionDate: commissionDate || null,
      creatorName,
      workGroupId,
      partNumber: partNumber ? Number(partNumber) : null,
      keyword: keywordValue,
    }),
    [commission.id, commissionDate, commissionSearchRows, creatorName, keywordValue, partNumber, selectedCharacterId, workGroupId],
  )

  async function saveCommission(previous: FormState, payload: FormData): Promise<FormState> {
    // 回调只反映本次提交；等待响应期间继续输入的草稿不应冒充已保存数据。
    const field = (name: string) => payload.get(name)?.toString().trim() ?? ''
    const requestedGroupId = field('workGroupId')
    const savedGroupId = requestedGroupId === 'new' ? crypto.randomUUID() : requestedGroupId
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
      partNumber: field('partNumber') ? Number(field('partNumber')) : null,
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
      setWorkGroupId(current => current === requestedGroupId ? savedGroupId : current)
      notifyDataUpdate({ characterIds: affectedCharacterIds })
      markPendingRebuild()
      onSaveSuccess?.(updated)
    }
    return result
  }

  useEffect(() => {
    if (!uploadStatus || uploadStatus.type === 'error') {
      return
    }

    const timer = window.setTimeout(() => {
      setUploadStatus(null)
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [uploadStatus])

  const handleDelete = () => {
    if (!isDeleteArmed) {
      setIsDeleteArmed(true)
      return
    }

    const characterIds = [commission.characterId]
    startDelete(() => {
      return deleteCommissionAction(commission.id)
        .then((result) => {
          if (result.status === 'success') {
            notifyDataUpdate({ characterIds })
            markPendingRebuild()
            setDeleteStatus({ text: 'Entry deleted.', type: 'success' })
            setIsDeleteArmed(false)
            onDelete?.()
            return
          }

          setDeleteStatus({
            text: result.message ?? 'Failed to delete commission.',
            type: 'error',
          })
          setIsDeleteArmed(false)
        })
        .catch(() => {
          setDeleteStatus({ text: 'Failed to delete commission.', type: 'error' })
          setIsDeleteArmed(false)
        })
    })
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
      setUploadStatus({ text: 'Choose a valid JPG or PNG image.', type: 'error' })
      input.value = ''
      return
    }

    setPendingCropFile(file)
  }

  const uploadSourceImage = (file: File) => {
    const payload = new FormData()
    payload.set('id', String(commission.id))
    payload.set('sourceImage', file)
    const characterIds = [commission.characterId]

    startUpload(() => {
      return replaceCommissionSourceImageAction(payload)
        .then((result) => {
          if (result.status === 'success') {
            const nextVersion = Date.now()
            notifyDataUpdate({ characterIds })
            markPendingRebuild()
            setUploadStatus({
              text: result.message ?? `Source image for commission #${commission.id} replaced.`,
              type: 'success',
            })
            setErrorSrc(null)
            setImageVersion(nextVersion)
            if (typeof window !== 'undefined') {
              window.sessionStorage.setItem(
                buildPreviewVersionStorageKey(commission.id),
                String(nextVersion),
              )
              window.dispatchEvent(new CustomEvent('admin-preview-image-version', {
                detail: { commissionId: commission.id, version: nextVersion },
              }))
            }
            return
          }

          setUploadStatus({
            text: result.message ?? 'Failed to replace source image.',
            type: 'error',
          })
        })
        .catch(() => {
          setUploadStatus({ text: 'Failed to replace source image.', type: 'error' })
        })
        .finally(() => {
          if (sourceImageInputRef.current) {
            sourceImageInputRef.current.value = ''
          }
        })
    })
  }

  const handleCropCancel = () => {
    setPendingCropFile(null)
    if (sourceImageInputRef.current) {
      sourceImageInputRef.current.value = ''
    }
  }

  const handleCropConfirm = (file: File) => {
    setPendingCropFile(null)
    uploadSourceImage(file)
  }

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input type="hidden" name="id" value={commission.id} />
      <input type="hidden" name="characterId" value={selectedCharacterId} />

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
            text-white shadow-[0_8px_18px_-8px_rgba(0,0,0,0.75)]
            backdrop-blur-sm transition
            hover:bg-black/70
            focus-visible:ring-2 focus-visible:ring-white/90
            focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900
            focus-visible:outline-none
            disabled:cursor-not-allowed disabled:opacity-50
          "
        >
          <IconUpload className="size-4" stroke={1.8} aria-hidden="true" />
        </button>
      </div>

      {uploadStatus
        ? (
            <FloatingNotice tone={uploadStatus.type} onDismiss={() => setUploadStatus(null)}>
              {uploadStatus.text}
            </FloatingNotice>
          )
        : null}

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
        linksRows={3}
        designValue={designValue}
        onDesignChange={setDesignValue}
        descriptionValue={descriptionValue}
        onDescriptionChange={setDescriptionValue}
        keywordValue={keywordValue}
        onKeywordChange={setKeywordValue}
        visibilityControl={<CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />}
      />

      <DuplicateCommissionNotice hints={duplicateHints} />

      <div className="
        mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200/60 pt-6
        dark:border-gray-700/60
        sm:gap-4
      "
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SubmitButton disabled={isDeleting || isUploading}>Save changes</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to update commission."
          />
        </div>

        <div className="
          ml-auto flex shrink-0 flex-wrap items-center gap-2
          sm:gap-4
        "
        >
          {isDeleteArmed && !isDeleting
            ? (
                <button
                  type="button"
                  onClick={() => setIsDeleteArmed(false)}
                  className="
                    inline-flex h-9 items-center justify-center rounded-md
                    border border-gray-300/80 px-3 text-sm font-medium
                    text-gray-600 transition
                    hover:bg-gray-50
                    focus-visible:ring-2 focus-visible:ring-gray-400
                    focus-visible:ring-offset-2 focus-visible:ring-offset-white
                    focus-visible:outline-none
                    sm:h-10 sm:px-4
                    dark:border-gray-700 dark:text-gray-300
                    dark:hover:bg-gray-900/40
                    dark:focus-visible:ring-offset-gray-900
                  "
                >
                  Cancel
                </button>
              )
            : null}

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isUploading || isSaving}
            className="
              inline-flex h-9 items-center justify-center rounded-md border
              border-red-200/70 px-3 text-sm font-medium text-red-600 transition
              hover:bg-red-50
              focus-visible:ring-2 focus-visible:ring-red-400
              focus-visible:ring-offset-2 focus-visible:ring-offset-white
              focus-visible:outline-none
              disabled:cursor-not-allowed disabled:opacity-60
              sm:h-10 sm:px-4
              dark:border-red-500/40 dark:text-red-300
              dark:hover:bg-red-500/10
              dark:focus-visible:ring-offset-gray-900
            "
          >
            {isDeleting ? 'Deleting…' : isDeleteArmed ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      </div>

      {deleteStatus
        ? (
            <FloatingNotice tone={deleteStatus.type} onDismiss={() => setDeleteStatus(null)}>
              {deleteStatus.text}
            </FloatingNotice>
          )
        : null}
    </form>
  )
}
