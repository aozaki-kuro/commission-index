import {
  CommissionCharacterField,
  CommissionCreatorField,
  CommissionDateField,
  CommissionDesignDescriptionFields,
  CommissionKeywordField,
  CommissionLinksField,
} from './CommissionFormFields'

interface CharacterOption {
  id: number
  name: string
}

interface CommissionSharedFieldsProps {
  characterOptions: CharacterOption[]
  selectedCharacterId: number | null
  onCharacterChange: (id: number | null) => void
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
}

export function CommissionSharedFields({
  characterOptions,
  selectedCharacterId,
  onCharacterChange,
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
}: CommissionSharedFieldsProps) {
  return (
    <div className="space-y-5">
      <div className="
        grid gap-4
        md:grid-cols-3
      "
      >
        <CommissionCharacterField
          options={characterOptions}
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

      <div className="
        space-y-4 border-t border-gray-200/60 pt-5
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
