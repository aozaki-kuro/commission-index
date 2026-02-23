import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAliasesPage from './page'

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const mockGetCreatorAliasesAdminData = vi.fn(() => [
  { creatorName: '七市', aliases: ['Nanashi'], commissionCount: 2 },
])

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}))

vi.mock('#lib/admin/db', () => ({
  getCreatorAliasesAdminData: () => mockGetCreatorAliasesAdminData(),
}))

vi.mock('./AliasesDashboard', () => ({
  default: ({ creators }: { creators: Array<{ creatorName: string }> }) => (
    <div data-testid="aliases-dashboard">{creators.map(item => item.creatorName).join(',')}</div>
  ),
}))

describe('AdminAliasesPage', () => {
  beforeEach(() => {
    mockNotFound.mockClear()
    mockGetCreatorAliasesAdminData.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('calls notFound in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(AdminAliasesPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(mockGetCreatorAliasesAdminData).not.toHaveBeenCalled()
  })

  it('renders aliases dashboard in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const element = await AdminAliasesPage()
    render(element)

    expect(screen.getByTestId('aliases-dashboard')).toHaveTextContent('七市')
    expect(mockGetCreatorAliasesAdminData).toHaveBeenCalledTimes(1)
  })
})
