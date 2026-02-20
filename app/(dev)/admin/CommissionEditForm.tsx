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
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'

import type { CharacterRow } from '#lib/admin/db'

import { updateCommissionAction, deleteCommissionAction } from '#admin/actions'
import { notifyDataUpdate } from './dataUpdateSignal'
import FormStatusIndicator from './FormStatusIndicator'
import SubmitButton from './SubmitButton'
import { INITIAL_FORM_STATE } from './types'

interface CommissionEditFormProps {
  commission: {
    id: number
    characterId: number
    fileName: string
    links: string[]
    design?: string | null
    description?: string | null
    keyword?: string | null
    hidden: boolean
  }
  characters: CharacterRow[]
  onDelete?: () => void
}

const buildImageSrc = (fileName: string) => `/images/${encodeURIComponent(fileName)}.jpg`

const surfaceStyles =
  'space-y-5 rounded-2xl border border-gray-200 bg-white/90 p-6 text-sm shadow-sm ring-1 ring-gray-900/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10'

const CommissionEditForm = ({ commission, characters, onDelete }: CommissionEditFormProps) => {
  const [state, formAction] = useActionState(updateCommissionAction, INITIAL_FORM_STATE)

  // ✅ 改为记录“出错的那一张 src”，避免在 effect 中同步 setState
  const [errorSrc, setErrorSrc] = useState<string | null>(null)

  const [isDeleting, startDelete] = useTransition()
  const [deleteStatus, setDeleteStatus] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const initialCharacterId = useMemo(() => {
    const exists = characters.some(character => character.id === commission.characterId)
    return exists ? commission.characterId : (sortedCharacters[0]?.id ?? commission.characterId)
  }, [characters, commission.characterId, sortedCharacters])

  const [selectedCharacterId, setSelectedCharacterId] = useState<number>(initialCharacterId)
  const [isHidden, setIsHidden] = useState<boolean>(commission.hidden)
  const [fileName, setFileName] = useState(commission.fileName)
  const initialLinks = useMemo(() => commission.links.join('\n'), [commission.links])
  const [linksValue, setLinksValue] = useState(initialLinks)
  const [designValue, setDesignValue] = useState(commission.design ?? '')
  const [descriptionValue, setDescriptionValue] = useState(commission.description ?? '')
  const [keywordValue, setKeywordValue] = useState(commission.keyword ?? '')

  const imageSrc = useMemo(() => buildImageSrc(fileName), [fileName])

  // ❌ 移除了 setImageError(false) 的 effect
  // ✅ 仅保留与“外部系统/副作用”相关的定时清除提示
  useEffect(() => {
    if (!deleteStatus) return
    const timer = setTimeout(() => setDeleteStatus(null), 2000)
    return () => clearTimeout(timer)
  }, [deleteStatus])

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
    <form action={formAction} className={surfaceStyles}>
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

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-300">
                File
              </p>
              <p className="mt-1 truncate font-medium text-gray-900 dark:text-gray-100">
                {commission.fileName}
              </p>
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
