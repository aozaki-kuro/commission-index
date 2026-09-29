import { useActionState, useEffect, useState } from 'react'
import { formControlStyles } from '../../app/ui'
import { addCharacterAction } from '../../lib/adminActions'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { INITIAL_FORM_STATE } from '../../lib/formState'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { FormStatusIndicator } from '../FormStatusIndicator'
import { SubmitButton } from '../SubmitButton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

type StatusValue = 'active' | 'archived'

const statusOptions: Array<{ value: StatusValue, label: string }> = [
  {
    label: 'Active',
    value: 'active',
  },
  {
    label: 'Archived',
    value: 'archived',
  },
]

export function AddCharacterForm({ onSaved, onPendingChange }: { onSaved: () => void, onPendingChange: (pending: boolean) => void }) {
  const [state, formAction, isPending] = useActionState(addCharacterAction, INITIAL_FORM_STATE)
  const [status, setStatus] = useState<StatusValue>('active')

  useEffect(() => {
    if (state.status === 'success') {
      notifyDataUpdate()
      markPendingRebuild()
      onSaved()
    }
  }, [onSaved, state])

  useEffect(() => onPendingChange(isPending), [isPending, onPendingChange])

  return (
    <form
      action={formAction}
      className="
        flex min-w-0 flex-1 flex-col gap-5 p-5
      "
    >
      <div className="
        grid gap-4
        sm:grid-cols-[minmax(0,1fr)_14rem]
      "
      >
        <div className="space-y-1">
          <label
            htmlFor="add-character-name"
            className="
              block pl-1 text-xs font-semibold tracking-wide text-gray-500 uppercase
              dark:text-gray-300
            "
          >
            Name
          </label>
          <input
            id="add-character-name"
            type="text"
            name="name"
            placeholder="Character name"
            required
            className={formControlStyles}
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="add-character-status"
            className="
              block pl-1 text-xs font-semibold tracking-wide text-gray-500 uppercase
              dark:text-gray-300
            "
          >
            Status
          </label>
          <Select
            value={status}
            onValueChange={value => setStatus(value as StatusValue)}
            name="status"
          >
            <SelectTrigger id="add-character-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="
            text-xs text-gray-500
            dark:text-gray-400
          "
          >
            This controls where the character appears on the public roster.
          </p>
        </div>
      </div>

      <div className="
        flex flex-wrap items-center gap-3 border-t border-gray-200/60 pt-5
        dark:border-gray-700/60
      "
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SubmitButton>Save character</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            errorFallback="Unable to save character."
          />
        </div>
      </div>
    </form>
  )
}
