// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SuggestionDashboard from './SuggestionDashboard'

describe('suggestionDashboard', () => {
  it('toggles selected keywords by normalized key', async () => {
    render(<SuggestionDashboard featuredKeywords={['Tag']} keywordOptions={['tag']} />)

    expect(screen.getByText('Featured keywords (1/6)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'tag' }))

    await waitFor(() => {
      expect(screen.getByText('Featured keywords (0/6)')).toBeInTheDocument()
      expect(screen.getByText('No featured keywords yet. Add up to six.')).toBeInTheDocument()
    })
  })

  it('filters deduped keyword options using normalized search input', async () => {
    render(
      <SuggestionDashboard
        featuredKeywords={[]}
        keywordOptions={['  Kanaut   Nishe ', 'kanaut nishe', 'Alice', 'Bob']}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Filter keyword options'), {
      target: { value: '  NISHE  ' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Kanaut Nishe' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'kanaut nishe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bob' })).not.toBeInTheDocument()
  })
})
