// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommissionCharacterField } from './CommissionFormFields'

vi.mock('#components/ui/select', async () => {
  const React = await import('react')

  interface SelectContextValue {
    value?: string
    disabled?: boolean
    onValueChange?: (value: string) => void
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null)

  const Select = ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value?: string
    disabled?: boolean
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => (
    <SelectContext value={{ value, disabled, onValueChange }}>
      {children}
    </SelectContext>
  )

  const SelectTrigger = ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode
  }) => {
    const context = React.use(SelectContext)

    return (
      <button {...props} type="button" disabled={context?.disabled}>
        {children}
      </button>
    )
  }

  const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>

  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>

  const SelectItem = ({ value, children }: { value: string, children: React.ReactNode }) => {
    const context = React.use(SelectContext)
    return (
      <button
        type="button"
        role="option"
        aria-selected={context?.value === value}
        onClick={() => context?.onValueChange?.(value)}
      >
        {children}
      </button>
    )
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  }
})

describe('commissionCharacterField', () => {
  it('updates the selected character when choosing an option', () => {
    const handleChange = vi.fn()

    render(
      <CommissionCharacterField
        options={[
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]}
        selectedCharacterId={null}
        onChange={handleChange}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: 'Alice' }))

    expect(handleChange).toHaveBeenCalledWith(1)
  })
})
