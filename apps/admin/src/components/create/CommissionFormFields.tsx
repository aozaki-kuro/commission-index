import type { ChangeEvent, ComponentPropsWithoutRef, ReactNode, RefObject } from 'react'
import type { CommissionWorkGroupOption } from '../../lib/commissionWorkGroups'
import { isFutureCommissionDate } from '@commission-index/domain'
import * as Popover from '@radix-ui/react-popover'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { formControlStyles } from '../../app/ui'
import { getDefaultPartNumber } from '../../lib/commissionWorkGroups'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

const fieldLabelStyles
  = 'block pl-1 text-sm font-medium text-gray-700 dark:text-gray-300'
const fieldDescriptionStyles = 'pl-1 text-xs leading-4 text-gray-500 dark:text-gray-400'
const alignedFieldStyles = 'min-w-0 space-y-2'
const metadataControlStyles = `${formControlStyles} min-h-11 px-4`

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
})
const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function parseIsoDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function formatIsoDate(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function getLocalIsoDate() {
  const now = new Date()
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1))
}

function buildCalendarDates(month: Date) {
  const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7
  const gridStart = new Date(Date.UTC(
    month.getUTCFullYear(),
    month.getUTCMonth(),
    1 - mondayOffset,
  ))

  return Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(
    gridStart.getUTCFullYear(),
    gridStart.getUTCMonth(),
    gridStart.getUTCDate() + index,
  )))
}

function isValidIsoDate(value: string) {
  return parseIsoDate(value) !== null
}

// Mirrors the worker rule so the error shows before submit; the worker stays authoritative.
function getCommissionDateValidityMessage(value: string) {
  if (!value) {
    return ''
  }
  if (!isValidIsoDate(value)) {
    return 'Enter a real date in YYYY-MM-DD format.'
  }
  return isFutureCommissionDate(value, new Date()) ? 'Commission date cannot be in the future.' : ''
}

type InputBinding = Pick<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'>
type TextareaBinding = Pick<ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'>

function bindInputValue(value?: string, onChange?: (value: string) => void): InputBinding | undefined {
  if (value === undefined || !onChange) {
    return undefined
  }

  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    value,
  }
}

function bindTextareaValue(value?: string, onChange?: (value: string) => void): TextareaBinding | undefined {
  if (value === undefined || !onChange) {
    return undefined
  }

  return {
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    value,
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
  dataState?: 'loading' | 'ready' | 'unavailable'
}

export function CommissionCharacterField({
  options,
  selectedCharacterId,
  onChange,
  disabled = false,
  dataState = 'ready',
}: CommissionCharacterFieldProps) {
  const hasCharacters = options.length > 0
  const isDisabled = disabled || dataState !== 'ready' || !hasCharacters

  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-character">
        Character
      </label>
      <Select
        value={selectedCharacterId === null ? '' : String(selectedCharacterId)}
        onValueChange={value => onChange(value ? Number(value) : null)}
        disabled={isDisabled}
        name="characterId"
      >
        <SelectTrigger
          id="create-commission-character"
          aria-label="Character"
          aria-busy={dataState === 'loading'}
          className="min-h-11 px-4 text-base sm:text-sm"
        >
          <SelectValue placeholder="Select character" />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.id} value={String(option.id)}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={fieldDescriptionStyles}>
        {dataState === 'ready' && !hasCharacters ? 'Add a character to get started.' : 'Choose a character.'}
      </p>
    </div>
  )
}

interface CommissionDateFieldProps {
  value?: string
  onChange?: (value: string) => void
}

interface CommissionCreatorFieldProps {
  value?: string
  onChange?: (value: string) => void
}

interface CommissionWorkGroupFieldProps {
  options: CommissionWorkGroupOption[]
  value: string
  onChange: (value: string) => void
  partNumber: string
  onPartNumberChange: (value: string) => void
  visibilityControl?: ReactNode
}

interface CommissionSourceImageFieldProps {
  accept?: string
  required?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

export function CommissionSourceImageField({
  accept = 'image/jpeg,image/png,.jpg,.jpeg,.png',
  required = false,
  inputRef,
  onChange,
}: CommissionSourceImageFieldProps) {
  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-source-image">
        {required ? 'Source image' : 'Source image (optional)'}
      </label>
      <input
        ref={inputRef}
        id="create-commission-source-image"
        type="file"
        name="sourceImage"
        accept={accept}
        required={required}
        onChange={onChange}
        className={`
          ${formControlStyles}
          pointer-events-none cursor-pointer
          file:pointer-events-auto file:mr-3 file:rounded-md file:border-0
          file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium
          file:text-gray-700
          hover:file:bg-gray-200
          dark:file:bg-gray-800 dark:file:text-gray-200
          dark:hover:file:bg-gray-700
        `}
      />
      <p className={fieldDescriptionStyles}>
        JPG or PNG. Crop to 1280×525 before uploading.
      </p>
    </div>
  )
}

export function CommissionDateField({
  value,
  onChange,
}: CommissionDateFieldProps) {
  const dateInputRef = useRef<HTMLInputElement>(null)

  const handleDateInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    event.target.setCustomValidity(getCommissionDateValidityMessage(nextValue))
    onChange?.(nextValue)
  }

  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-date">
        Delivery date
      </label>
      <div className="flex min-w-0">
        <input
          ref={dateInputRef}
          id="create-commission-date"
          type="text"
          name="commissionDate"
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
          title="Enter a valid date in YYYY-MM-DD format."
          required
          value={value ?? ''}
          onChange={handleDateInput}
          onBlur={(event) => {
            event.currentTarget.setCustomValidity(
              getCommissionDateValidityMessage(event.currentTarget.value),
            )
          }}
          className={`${metadataControlStyles} min-w-0 rounded-r-none border-r-0`}
          aria-describedby="create-commission-date-hint"
        />
        <CommissionDatePicker
          value={value}
          onSelect={(dateValue) => {
            dateInputRef.current?.setCustomValidity(getCommissionDateValidityMessage(dateValue))
            onChange?.(dateValue)
          }}
        />
      </div>
      <p id="create-commission-date-hint" className={fieldDescriptionStyles}>
        Use YYYY-MM-DD.
      </p>
    </div>
  )
}

interface CommissionDatePickerProps {
  value?: string
  onSelect: (value: string) => void
}

const monthNavigationButtonStyles
  = 'inline-flex size-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-800'

function CommissionDatePicker({ value, onSelect }: CommissionDatePickerProps) {
  const selectedDate = parseIsoDate(value)
  const [today, setToday] = useState(getLocalIsoDate)
  const calendarRef = useRef<HTMLDivElement>(null)
  const [visibleMonth, setVisibleMonth] = useState(
    () => selectedDate ?? parseIsoDate(today)!,
  )
  const [isOpen, setIsOpen] = useState(false)
  const calendarDates = buildCalendarDates(visibleMonth)

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const currentToday = getLocalIsoDate()
      setToday(currentToday)
      setVisibleMonth(selectedDate ?? parseIsoDate(currentToday)!)
    }
    setIsOpen(open)
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Choose delivery date"
          aria-haspopup="dialog"
          className="
            inline-flex min-h-11 shrink-0 items-center justify-center
            rounded-r-lg border border-gray-200 bg-white/80 px-3
            text-gray-500 shadow-sm transition hover:bg-gray-100
            focus-visible:z-10 focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-gray-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300
            dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900
          "
        >
          <IconCalendar className="size-4" stroke={1.8} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={calendarRef}
          role="dialog"
          aria-label="Choose delivery date"
          side="bottom"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            calendarRef.current?.querySelector<HTMLButtonElement>(
              `[data-calendar-date="${formatIsoDate(selectedDate ?? parseIsoDate(today)!)}"]`,
            )?.focus()
          }}
          className="
            z-[90] w-[min(20rem,calc(100vw-2rem))] rounded-xl border
            border-gray-200 bg-white p-4 text-gray-900 shadow-xl
            ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-950
            dark:text-gray-100 dark:ring-white/10
          "
        >
          <header className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(month => addMonths(month, -1))}
              className={monthNavigationButtonStyles}
            >
              <IconChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <h3 aria-live="polite" className="text-sm font-semibold">
              {monthFormatter.format(visibleMonth)}
            </h3>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth(month => addMonths(month, 1))}
              className={monthNavigationButtonStyles}
            >
              <IconChevronRight className="size-4" aria-hidden="true" />
            </button>
          </header>
          <CommissionCalendarGrid
            dates={calendarDates}
            month={visibleMonth}
            selectedValue={value}
            today={today}
            onSelect={(date) => {
              onSelect(formatIsoDate(date))
              setIsOpen(false)
            }}
            onMoveFocus={(date) => {
              if (date.getUTCMonth() !== visibleMonth.getUTCMonth()) {
                setVisibleMonth(date)
              }
              requestAnimationFrame(() => {
                document.querySelector<HTMLButtonElement>(
                  `[data-calendar-date="${formatIsoDate(date)}"]`,
                )?.focus()
              })
            }}
          />
          <div className="mt-3 flex justify-end border-t border-gray-100 pt-3 dark:border-gray-800">
            <button
              type="button"
              aria-label="Select today"
              onClick={() => {
                onSelect(getLocalIsoDate())
                setIsOpen(false)
              }}
              className="min-h-9 rounded-lg px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Today
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface CommissionCalendarGridProps {
  dates: Date[]
  month: Date
  selectedValue?: string
  today: string
  onSelect: (date: Date) => void
  onMoveFocus: (date: Date) => void
}

function CommissionCalendarGrid({
  dates,
  month,
  selectedValue,
  today,
  onSelect,
  onMoveFocus,
}: CommissionCalendarGridProps) {
  return (
    <div role="grid" aria-label={monthFormatter.format(month)}>
      <div role="row" className="mb-1 grid grid-cols-7">
        {weekdayLabels.map(day => (
          <div
            key={day}
            role="columnheader"
            aria-label={day}
            className="py-1 text-center text-[0.65rem] font-medium uppercase text-gray-400"
          >
            {day.slice(0, 1)}
          </div>
        ))}
      </div>
      {Array.from({ length: 6 }, (_, week) => (
        <div key={week} role="row" className="grid grid-cols-7">
          {dates.slice(week * 7, week * 7 + 7).map(date => (
            <CalendarDay
              key={formatIsoDate(date)}
              date={date}
              month={month}
              isSelected={formatIsoDate(date) === selectedValue}
              isToday={formatIsoDate(date) === today}
              onSelect={onSelect}
              onMoveFocus={onMoveFocus}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface CalendarDayProps {
  date: Date
  month: Date
  isSelected: boolean
  isToday: boolean
  onSelect: (date: Date) => void
  onMoveFocus: (date: Date) => void
}

function CalendarDay({
  date,
  month,
  isSelected,
  isToday,
  onSelect,
  onMoveFocus,
}: CalendarDayProps) {
  const dateValue = formatIsoDate(date)
  const isCurrentMonth = date.getUTCMonth() === month.getUTCMonth()
  const offsets: Record<string, number> = {
    ArrowDown: 7,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
  }

  return (
    <div role="gridcell" aria-selected={isSelected}>
      <button
        type="button"
        aria-label={dateFormatter.format(date)}
        aria-pressed={isSelected}
        data-calendar-date={dateValue}
        onClick={() => onSelect(date)}
        onKeyDown={(event) => {
          const offset = offsets[event.key]
          if (offset === undefined) {
            return
          }
          event.preventDefault()
          onMoveFocus(new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate() + offset,
          )))
        }}
        tabIndex={isSelected || isToday ? 0 : -1}
        className={`
          mx-auto flex size-9 items-center justify-center rounded-full
          text-sm transition hover:bg-gray-100 focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-gray-500 dark:hover:bg-gray-800
          ${isCurrentMonth ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'}
          ${isSelected ? 'bg-gray-900 font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200' : ''}
        `}
      >
        {date.getUTCDate()}
      </button>
    </div>
  )
}

export function CommissionCreatorField({ value, onChange }: CommissionCreatorFieldProps) {
  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-creator">
        Creator (optional)
      </label>
      <input
        id="create-commission-creator"
        type="text"
        name="creatorName"
        autoComplete="off"
        placeholder="Artist or studio"
        className={metadataControlStyles}
        {...(bindInputValue(value, onChange) ?? {})}
      />
      <p className={fieldDescriptionStyles}>
        Leave blank if unknown.
      </p>
    </div>
  )
}

export function CommissionWorkGroupField({
  options,
  value,
  onChange,
  partNumber,
  onPartNumberChange,
  visibilityControl,
}: CommissionWorkGroupFieldProps) {
  const selectedGroup = options.find(option => option.id === value)
  const isGrouped = Boolean(value)
  const previousSelectionRef = useRef({ value, partNumber })

  return (
    <div className="min-w-0">
      <input type="hidden" name="workGroupId" value={value} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <label className="flex min-h-9 items-center gap-3 pl-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={isGrouped}
            aria-expanded={isGrouped}
            aria-controls="commission-parting-fields"
            onChange={(event) => {
              if (!event.target.checked) {
                previousSelectionRef.current = { value, partNumber }
                onChange('')
                onPartNumberChange('')
                return
              }
              const nextValue = previousSelectionRef.current.value || 'new'
              onChange(nextValue)
              onPartNumberChange(previousSelectionRef.current.partNumber || partNumber || getDefaultPartNumber(nextValue, options))
            }}
            className="size-4 shrink-0 accent-gray-900 dark:accent-gray-100"
          />
          Part of a multi-part work
        </label>
        {visibilityControl}
      </div>
      {isGrouped
        ? (
            <div id="commission-parting-fields" className="mt-3 grid min-w-0 gap-4 md:grid-cols-[2fr_1fr]">
              <div className={alignedFieldStyles}>
                <label className={fieldLabelStyles} htmlFor="create-commission-work-group">
                  Part group
                </label>
                <Select
                  value={value}
                  onValueChange={(nextValue) => {
                    onChange(nextValue)
                    onPartNumberChange(
                      nextValue === 'new' && partNumber
                        ? partNumber
                        : getDefaultPartNumber(nextValue, options),
                    )
                  }}
                >
                  <SelectTrigger
                    id="create-commission-work-group"
                    aria-label="Part grouping"
                    className="min-h-11 min-w-0 px-4 text-base sm:text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New multi-part group</SelectItem>
                    {options.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={fieldDescriptionStyles}>
                  Keep separately published parts in one explicit group.
                </p>
              </div>
              <div className={alignedFieldStyles}>
                <label className={fieldLabelStyles} htmlFor="create-commission-part-number">
                  Part number
                </label>
                <input
                  id="create-commission-part-number"
                  type="number"
                  name="partNumber"
                  min={1}
                  step={1}
                  required
                  value={partNumber}
                  onChange={event => onPartNumberChange(event.target.value)}
                  className={metadataControlStyles}
                  aria-label="Part number"
                />
                <p className={fieldDescriptionStyles}>
                  {selectedGroup ? `Next available: ${selectedGroup.highestPartNumber + 1}.` : 'Use a positive whole number.'}
                </p>
              </div>
            </div>
          )
        : null}
    </div>
  )
}

interface CommissionLinksFieldProps {
  value?: string
  onChange?: (value: string) => void
  rows?: number
}

export function CommissionLinksField({
  value,
  onChange,
  rows = 4,
}: CommissionLinksFieldProps) {
  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-links">
        Links (optional, one per line)
      </label>
      <textarea
        id="create-commission-links"
        name="links"
        rows={rows}
        placeholder="https://example.com"
        className={metadataControlStyles}
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

export function CommissionDesignDescriptionFields({
  designValue,
  onDesignChange,
  descriptionValue,
  onDescriptionChange,
  designPlaceholder,
  descriptionPlaceholder,
}: CommissionDesignDescriptionFieldsProps) {
  return (
    <div className="
      grid gap-4
      @min-[30rem]/fields:grid-cols-2
    "
    >
      <div className={alignedFieldStyles}>
        <label className={fieldLabelStyles} htmlFor="create-commission-design">
          Design (optional)
        </label>
        <input
          id="create-commission-design"
          type="text"
          name="design"
          placeholder={designPlaceholder}
          className={metadataControlStyles}
          {...(bindInputValue(designValue, onDesignChange) ?? {})}
        />
      </div>

      <div className={alignedFieldStyles}>
        <label className={fieldLabelStyles} htmlFor="create-commission-description">
          Description (optional)
        </label>
        <input
          id="create-commission-description"
          type="text"
          name="description"
          placeholder={descriptionPlaceholder}
          className={metadataControlStyles}
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

export function CommissionKeywordField({ value, onChange }: CommissionKeywordFieldProps) {
  return (
    <div className={alignedFieldStyles}>
      <label className={fieldLabelStyles} htmlFor="create-commission-keyword">
        Keywords (optional, comma-separated, search-only)
      </label>
      <input
        id="create-commission-keyword"
        type="text"
        name="keyword"
        placeholder="e.g. studio k, skeb, private tag"
        className={metadataControlStyles}
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

export function CommissionHiddenSwitch({
  isHidden,
  onChange,
}: CommissionHiddenSwitchProps) {
  return (
    <label className="flex min-h-9 items-center gap-3 pl-1 text-sm font-medium text-gray-700 dark:text-gray-200">
      <input
        id="commission-hidden"
        type="checkbox"
        name="hidden"
        checked={isHidden}
        onChange={event => onChange(event.target.checked)}
        aria-label="Hide commission from public list"
        className="
          size-4 shrink-0 accent-gray-900
          dark:accent-gray-100
        "
      />
      Hidden
    </label>
  )
}
