import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select'
import { type ChangeEvent, type ComponentPropsWithoutRef } from 'react'
import { formControlStyles } from '../uiStyles'

const fieldLabelStyles =
  'text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300'
const fieldDescriptionStyles = 'text-xs text-gray-500 dark:text-gray-400'

type InputBinding = Pick<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'>
type TextareaBinding = Pick<ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'>

const bindInputValue = (
  value?: string,
  onChange?: (value: string) => void,
): InputBinding | undefined => {
  if (value === undefined || !onChange) return undefined
  return {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
  }
}

const bindTextareaValue = (
  value?: string,
  onChange?: (value: string) => void,
): TextareaBinding | undefined => {
  if (value === undefined || !onChange) return undefined
  return {
    value,
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
  }
}

interface CharacterSelectOption {
  id: number
  name: string
}

interface CommissionCharacterFieldProps {
  options: CharacterSelectOption[]
  selectedCharacterId: number | null
  onChange: (id: number | null) => void
  disabled?: boolean
  dropdownZIndexClassName?: string
}

export const CommissionCharacterField = ({
  options,
  selectedCharacterId,
  onChange,
  disabled = false,
  dropdownZIndexClassName = 'z-10',
}: CommissionCharacterFieldProps) => {
  const selectedCharacter = options.find(option => option.id === selectedCharacterId) ?? null
  const hasCharacters = options.length > 0
  const isDisabled = disabled || !hasCharacters

  return (
    <div className="space-y-1">
      <label className={fieldLabelStyles}>Character</label>
      <Select
        value={selectedCharacterId === null ? undefined : String(selectedCharacterId)}
        onValueChange={value => onChange(Number(value))}
        disabled={isDisabled}
      >
        <SelectTrigger
          className={`${formControlStyles} h-auto py-2.5 ${isDisabled ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          <SelectValue
            placeholder={hasCharacters ? 'Select character' : 'No characters available'}
            aria-label={selectedCharacter?.name}
          >
            {selectedCharacter?.name}
          </SelectValue>
        </SelectTrigger>
        {hasCharacters ? (
          <SelectContent className={dropdownZIndexClassName}>
            {options.map(option => (
              <SelectItem key={option.id} value={String(option.id)}>
                <p className="font-medium">{option.name}</p>
              </SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>
      <p className={fieldDescriptionStyles}>Choose the character this commission belongs to.</p>
    </div>
  )
}

interface CommissionFileNameFieldProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

interface CommissionSourceImageFieldProps {
  accept?: string
  helperMessage?: string
  helperTone?: 'default' | 'success' | 'error'
  required?: boolean
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

export const CommissionSourceImageField = ({
  accept = 'image/jpeg,image/png,.jpg,.jpeg,.png',
  helperMessage = 'Upload JPG/PNG. It will be saved to data/images using this file name and then imported automatically.',
  helperTone = 'default',
  required = false,
  onChange,
}: CommissionSourceImageFieldProps) => {
  const helperMessageClassName =
    helperTone === 'error'
      ? 'text-red-600 dark:text-red-400'
      : helperTone === 'success'
        ? 'text-emerald-600 dark:text-emerald-400'
        : fieldDescriptionStyles

  return (
    <div className="space-y-1">
      <label className={fieldLabelStyles}>
        {required ? 'Source image' : 'Source image (optional)'}
      </label>
      <input
        type="file"
        name="sourceImage"
        accept={accept}
        required={required}
        onChange={onChange}
        className={`${formControlStyles} pointer-events-none cursor-pointer file:pointer-events-auto file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-800 dark:file:text-gray-200 dark:hover:file:bg-gray-700`}
      />
      <p className={helperMessageClassName}>{helperMessage}</p>
    </div>
  )
}

export const CommissionFileNameField = ({
  value,
  onChange,
  placeholder,
}: CommissionFileNameFieldProps) => {
  return (
    <div className="space-y-1">
      <label className={fieldLabelStyles}>File name</label>
      <input
        type="text"
        name="fileName"
        required
        placeholder={placeholder}
        className={formControlStyles}
        {...(bindInputValue(value, onChange) ?? {})}
      />
    </div>
  )
}

interface CommissionLinksFieldProps {
  value?: string
  onChange?: (value: string) => void
  rows?: number
}

export const CommissionLinksField = ({ value, onChange, rows = 4 }: CommissionLinksFieldProps) => {
  return (
    <div className="space-y-1">
      <label className={fieldLabelStyles}>Links (optional, one per line)</label>
      <textarea
        name="links"
        rows={rows}
        placeholder="https://example.com"
        className={formControlStyles}
        {...(bindTextareaValue(value, onChange) ?? {})}
      />
      <p className={fieldDescriptionStyles}>
        Paste each URL on a separate line, or leave blank if none.
      </p>
    </div>
  )
}

interface CommissionDesignDescriptionFieldsProps {
  designValue?: string
  onDesignChange?: (value: string) => void
  descriptionValue?: string
  onDescriptionChange?: (value: string) => void
  designPlaceholder?: string
  descriptionPlaceholder?: string
}

export const CommissionDesignDescriptionFields = ({
  designValue,
  onDesignChange,
  descriptionValue,
  onDescriptionChange,
  designPlaceholder,
  descriptionPlaceholder,
}: CommissionDesignDescriptionFieldsProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <label className={fieldLabelStyles}>Design (optional)</label>
        <input
          type="text"
          name="design"
          placeholder={designPlaceholder}
          className={formControlStyles}
          {...(bindInputValue(designValue, onDesignChange) ?? {})}
        />
      </div>

      <div className="space-y-1">
        <label className={fieldLabelStyles}>Description (optional)</label>
        <input
          type="text"
          name="description"
          placeholder={descriptionPlaceholder}
          className={formControlStyles}
          {...(bindInputValue(descriptionValue, onDescriptionChange) ?? {})}
        />
      </div>
    </div>
  )
}

interface CommissionKeywordFieldProps {
  value?: string
  onChange?: (value: string) => void
}

export const CommissionKeywordField = ({ value, onChange }: CommissionKeywordFieldProps) => {
  return (
    <div className="space-y-1">
      <label className={fieldLabelStyles}>Keywords (optional, comma-separated, search-only)</label>
      <input
        type="text"
        name="keyword"
        placeholder="e.g. studio k, skeb, private tag"
        className={formControlStyles}
        {...(bindInputValue(value, onChange) ?? {})}
      />
      <p className={fieldDescriptionStyles}>
        Separate keywords with commas. They are searchable but never rendered publicly.
      </p>
    </div>
  )
}

interface CommissionHiddenSwitchProps {
  isHidden: boolean
  onChange: (next: boolean) => void
}

export const CommissionHiddenSwitch = ({ isHidden, onChange }: CommissionHiddenSwitchProps) => {
  return (
    <div className="flex items-center gap-3">
      <input
        id="commission-hidden"
        type="checkbox"
        checked={isHidden}
        onChange={event => onChange(event.target.checked)}
        aria-label="Hide commission from public list"
        className="h-4 w-4 accent-gray-900 dark:accent-gray-100"
      />
      <label
        htmlFor="commission-hidden"
        className="text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        Hidden
      </label>
    </div>
  )
}
