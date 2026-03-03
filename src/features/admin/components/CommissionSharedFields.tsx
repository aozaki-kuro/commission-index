import {
  CommissionCharacterField,
  CommissionDesignDescriptionFields,
  CommissionFileNameField,
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
  fileName?: string
  onFileNameChange?: (value: string) => void
  fileNamePlaceholder?: string
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
  dropdownZIndexClassName?: string
}

const CommissionSharedFields = ({
  characterOptions,
  selectedCharacterId,
  onCharacterChange,
  fileName,
  onFileNameChange,
  fileNamePlaceholder,
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
  dropdownZIndexClassName = 'z-10',
}: CommissionSharedFieldsProps) => {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <CommissionCharacterField
          options={characterOptions}
          selectedCharacterId={selectedCharacterId}
          onChange={onCharacterChange}
          dropdownZIndexClassName={dropdownZIndexClassName}
        />
        <CommissionFileNameField
          placeholder={fileNamePlaceholder}
          value={fileName}
          onChange={onFileNameChange}
        />
      </div>

      <CommissionLinksField value={linksValue} onChange={onLinksChange} rows={linksRows} />

      <CommissionDesignDescriptionFields
        designValue={designValue}
        onDesignChange={onDesignChange}
        descriptionValue={descriptionValue}
        onDescriptionChange={onDescriptionChange}
        designPlaceholder={designPlaceholder}
        descriptionPlaceholder={descriptionPlaceholder}
      />

      <CommissionKeywordField value={keywordValue} onChange={onKeywordChange} />
    </>
  )
}

export default CommissionSharedFields
