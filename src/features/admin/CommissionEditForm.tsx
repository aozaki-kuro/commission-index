import { CommissionHiddenSwitch } from './components/CommissionFormFields'
import CommissionSharedFields from './components/CommissionSharedFields'
import { useActionState, useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react'

import type { CharacterRow } from '#lib/admin/db'

import {
  updateCommissionAction,
  deleteCommissionAction,
  replaceCommissionSourceImageAction,
} from '#admin/actions'
import { Button } from '#components/ui/button'
import { notifyDataUpdate } from './dataUpdateSignal'
import FormStatusIndicator from './FormStatusIndicator'
import SubmitButton from './SubmitButton'
import { INITIAL_FORM_STATE } from './types'
import { adminSurfaceStyles } from './uiStyles'
import useCommissionEditState, { type EditableCommission } from './hooks/useCommissionEditState'

interface CommissionEditFormProps {
  commission: EditableCommission
  characters: CharacterRow[]
  onDelete?: () => void
}

type OperationStatus = {
  type: 'success' | 'error'
  text: string
}

const buildPreviewVersionStorageKey = (commissionId: number) =>
  `admin-preview-image-version:${commissionId}`

const CommissionEditForm = ({ commission, characters, onDelete }: CommissionEditFormProps) => {
  const [state, formAction] = useActionState(updateCommissionAction, INITIAL_FORM_STATE)
  const [isDeleting, startDelete] = useTransition()
  const [isUploading, startUpload] = useTransition()
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadStatus, setUploadStatus] = useState<OperationStatus | null>(null)
  const [imageVersion, setImageVersion] = useState(() => {
    if (typeof window === 'undefined') return 0

    const stored = window.sessionStorage.getItem(buildPreviewVersionStorageKey(commission.id))
    if (!stored) return 0

    const parsed = Number(stored)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })
  const {
    sortedCharacters,
    initialCharacterId,
    selectedCharacterId,
    setSelectedCharacterId,
    isHidden,
    setIsHidden,
    fileName,
    setFileName,
    linksValue,
    setLinksValue,
    designValue,
    setDesignValue,
    descriptionValue,
    setDescriptionValue,
    keywordValue,
    setKeywordValue,
    imageSrc,
    errorSrc,
    setErrorSrc,
    deleteStatus,
    setDeleteStatus,
  } = useCommissionEditState({ commission, characters })
  const previewImageSrc = imageVersion > 0 ? `${imageSrc}?v=${imageVersion}` : imageSrc

  useEffect(() => {
    if (state.status === 'success') notifyDataUpdate()
  }, [state.status])

  useEffect(() => {
    if (!uploadStatus) return
    const timer = window.setTimeout(() => setUploadStatus(null), 2400)
    return () => window.clearTimeout(timer)
  }, [uploadStatus])

  const handleDelete = () => {
    if (!window.confirm('Delete this commission entry?')) return

    startDelete(() => {
      deleteCommissionAction(commission.id)
        .then(result => {
          if (result.status === 'success') {
            setDeleteStatus({ type: 'success', text: 'Entry deleted.' })
            onDelete?.()
          } else {
            setDeleteStatus({
              type: 'error',
              text: result.message ?? 'Failed to delete commission.',
            })
          }
        })
        .catch(() => setDeleteStatus({ type: 'error', text: 'Failed to delete commission.' }))
    })
  }

  const handleSelectSourceImage = () => {
    if (fileName.trim() !== commission.fileName) {
      setUploadStatus({
        type: 'error',
        text: 'Save file name changes before reuploading the source image.',
      })
      return
    }

    sourceImageInputRef.current?.click()
  }

  const handleSourceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget
    const file = inputElement.files?.[0]
    if (!file) return

    if (fileName.trim() !== commission.fileName) {
      setUploadStatus({
        type: 'error',
        text: 'Save file name changes before reuploading the source image.',
      })
      inputElement.value = ''
      return
    }

    const payload = new FormData()
    payload.set('id', String(commission.id))
    payload.set('commissionFileName', commission.fileName)
    payload.set('sourceImage', file)

    startUpload(() => {
      replaceCommissionSourceImageAction(payload)
        .then(result => {
          if (result.status === 'success') {
            setUploadStatus({
              type: 'success',
              text: result.message ?? `Source image for "${commission.fileName}" replaced.`,
            })
            setErrorSrc(null)
            const nextVersion = Date.now()
            setImageVersion(nextVersion)
            if (typeof window !== 'undefined') {
              window.sessionStorage.setItem(
                buildPreviewVersionStorageKey(commission.id),
                String(nextVersion),
              )
            }
            return
          }

          setUploadStatus({
            type: 'error',
            text: result.message ?? 'Failed to replace source image.',
          })
        })
        .catch(() => {
          setUploadStatus({ type: 'error', text: 'Failed to replace source image.' })
        })
        .finally(() => {
          inputElement.value = ''
        })
    })
  }

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="id" value={commission.id} />
      <input type="hidden" name="characterId" value={selectedCharacterId} />
      {isHidden && <input type="hidden" name="hidden" value="on" />}

      <div className="space-y-4">
        <div className="space-y-3">
          <div className="group relative aspect-1280/525 w-full overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900/30">
            {errorSrc === imageSrc ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-300">
                Image not found
              </div>
            ) : (
              <img
                src={previewImageSrc}
                alt={commission.fileName}
                className="h-full w-full object-contain"
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
              disabled={isUploading || isDeleting}
              className="absolute right-3 bottom-3 inline-flex h-9 w-9 translate-y-1 scale-95 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 shadow-[0_8px_18px_-8px_rgba(0,0,0,0.75)] backdrop-blur-sm transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.8)] focus-visible:translate-y-0 focus-visible:scale-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/65 dark:text-white"
              aria-label={`Reupload source image for ${commission.fileName}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition group-hover:brightness-110"
              >
                <path d="M12 16V4" />
                <path d="M8.5 7.5L12 4l3.5 3.5" />
                <path d="M4 14.5V18a2 2 0 002 2h12a2 2 0 002-2v-3.5" />
              </svg>
            </button>
          </div>

          {uploadStatus && (
            <p
              className={`text-xs ${
                uploadStatus.type === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500 dark:text-red-400'
              }`}
            >
              {uploadStatus.text}
            </p>
          )}

          <CommissionSharedFields
            characterOptions={sortedCharacters}
            selectedCharacterId={selectedCharacterId}
            onCharacterChange={id => setSelectedCharacterId(id ?? initialCharacterId)}
            fileName={fileName}
            onFileNameChange={setFileName}
            linksValue={linksValue}
            onLinksChange={setLinksValue}
            linksRows={3}
            designValue={designValue}
            onDesignChange={setDesignValue}
            descriptionValue={descriptionValue}
            onDescriptionChange={setDescriptionValue}
            keywordValue={keywordValue}
            onKeywordChange={setKeywordValue}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <SubmitButton>Save changes</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to update commission."
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <CommissionHiddenSwitch isHidden={isHidden} onChange={setIsHidden} />

          <Button
            type="button"
            onClick={handleDelete}
            variant="outline"
            disabled={isDeleting}
            className="border-red-200/70 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>

      {deleteStatus && (
        <p
          className={`text-sm ${deleteStatus.type === 'success' ? 'text-gray-700 dark:text-gray-200' : 'text-red-500'}`}
        >
          {deleteStatus.text}
        </p>
      )}
    </form>
  )
}

export default CommissionEditForm
