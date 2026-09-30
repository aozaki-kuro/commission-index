import type { ReactNode } from 'react'
import type { WorkGroupCandidate } from '../../lib/commissionWorkGroups'
import { buildWorkGroupOptions } from '../../lib/commissionWorkGroups'
import {
  CommissionCharacterField,
  CommissionCreatorField,
  CommissionDateField,
  CommissionDesignDescriptionFields,
  CommissionKeywordField,
  CommissionLinksField,
  CommissionWorkGroupField,
} from './CommissionFormFields'

interface CharacterOption {
  id: number
  name: string
}

interface CommissionSharedFieldsProps {
  characterOptions: CharacterOption[]
  characterDataState?: 'loading' | 'ready' | 'unavailable'
  selectedCharacterId: number | null
  onCharacterChange: (id: number | null) => void
  commissionSearchRows: WorkGroupCandidate[]
  workGroupId: string
  onWorkGroupIdChange: (value: string) => void
  partNumber: string
  onPartNumberChange: (value: string) => void
  commissionDate?: string
  onCommissionDateChange?: (value: string) => void
  creatorName?: string
  onCreatorNameChange?: (value: string) => void
  linksValue?: string
  onLinksChange?: (value: string) => void
  linksRows?: number
  designValue?: string
  onDesignChange?: (value: string) => void
  descriptionValue?: string
  onDescriptionChange?: (value: string) => void
  designPlaceholder?: string
  descriptionPlaceholder?: string
  keywordValue?: string
  onKeywordChange?: (value: string) => void
  visibilityControl?: ReactNode
}

export function CommissionSharedFields({
  characterOptions,
  characterDataState = 'ready',
  selectedCharacterId,
  onCharacterChange,
  commissionSearchRows,
  workGroupId,
  onWorkGroupIdChange,
  partNumber,
  onPartNumberChange,
  commissionDate,
  onCommissionDateChange,
  creatorName,
  onCreatorNameChange,
  linksValue,
  onLinksChange,
  linksRows = 3,
  designValue,
  onDesignChange,
  descriptionValue,
  onDescriptionChange,
  designPlaceholder,
  descriptionPlaceholder,
  keywordValue,
  onKeywordChange,
  visibilityControl,
}: CommissionSharedFieldsProps) {
  return (
    <div className="@container/fields space-y-5">
      <div className="
        grid min-w-0 items-start gap-5
        @min-[36rem]/fields:grid-cols-3
      "
      >
        <CommissionCharacterField
          options={characterOptions}
          dataState={characterDataState}
          selectedCharacterId={selectedCharacterId}
          onChange={onCharacterChange}
        />
        <CommissionDateField
          value={commissionDate}
          onChange={onCommissionDateChange}
        />
        <CommissionCreatorField
          value={creatorName}
          onChange={onCreatorNameChange}
        />
      </div>

      <div>
        <CommissionWorkGroupField
          options={buildWorkGroupOptions(commissionSearchRows)}
          value={workGroupId}
          onChange={onWorkGroupIdChange}
          partNumber={partNumber}
          onPartNumberChange={onPartNumberChange}
          visibilityControl={visibilityControl}
        />
      </div>

      <div className="
        space-y-5 border-t border-gray-200/60 pt-5
        dark:border-gray-700/60
      "
      >
        <CommissionLinksField
          value={linksValue}
          onChange={onLinksChange}
          rows={linksRows}
        />

        <CommissionDesignDescriptionFields
          designValue={designValue}
          onDesignChange={onDesignChange}
          descriptionValue={descriptionValue}
          onDescriptionChange={onDescriptionChange}
          designPlaceholder={designPlaceholder}
          descriptionPlaceholder={descriptionPlaceholder}
        />

        <CommissionKeywordField value={keywordValue} onChange={onKeywordChange} />
      </div>
    </div>
  )
}
