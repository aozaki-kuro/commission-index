'use client'

import {
  CommissionCharacterField,
  CommissionDesignDescriptionFields,
  CommissionFileNameField,
  CommissionHiddenSwitch,
  CommissionKeywordField,
  CommissionLinksField,
} from './components/CommissionFormFields'
import Image from 'next/image'
import { useActionState, useEffect, useTransition } from 'react'

import type { CharacterRow } from '#lib/admin/db'

import { updateCommissionAction, deleteCommissionAction } from '#admin/actions'
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

const CommissionEditForm = ({ commission, characters, onDelete }: CommissionEditFormProps) => {
  const [state, formAction] = useActionState(updateCommissionAction, INITIAL_FORM_STATE)
  const [isDeleting, startDelete] = useTransition()
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

  useEffect(() => {
    if (state.status === 'success') notifyDataUpdate()
  }, [state.status])

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

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="id" value={commission.id} />
      <input type="hidden" name="characterId" value={selectedCharacterId} />
      {isHidden && <input type="hidden" name="hidden" value="on" />}

      <div className="space-y-4">
        <div className="space-y-3">
          <div className="relative aspect-1280/525 w-full overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900/30">
            {errorSrc === imageSrc ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-300">
                Image not found
              </div>
            ) : (
              <Image
                src={imageSrc}
                alt={commission.fileName}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 480px"
                unoptimized
                onError={() => setErrorSrc(imageSrc)}
              />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <CommissionCharacterField
              options={sortedCharacters}
              selectedCharacterId={selectedCharacterId}
              onChange={id => setSelectedCharacterId(id ?? initialCharacterId)}
              dropdownZIndexClassName="z-20"
            />
            <CommissionFileNameField value={fileName} onChange={setFileName} />
          </div>
        </div>

        <CommissionLinksField value={linksValue} onChange={setLinksValue} rows={3} />

        <CommissionDesignDescriptionFields
          designValue={designValue}
          onDesignChange={setDesignValue}
          descriptionValue={descriptionValue}
          onDescriptionChange={setDescriptionValue}
        />

        <CommissionKeywordField value={keywordValue} onChange={setKeywordValue} />
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

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200/70 px-4 text-sm font-medium text-red-600 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10 dark:focus-visible:ring-offset-gray-900"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
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
