import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from './page'

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

const mockGetAdminData = vi.fn(() => ({
  characters: [{ id: 1, DisplayName: 'Test Character', Status: 'active' }],
  commissions: [{ id: 1, CharacterID: 1, FileName: '20240203' }],
}))
const mockGetCreatorAliasesAdminData = vi.fn(() => [])

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}))

vi.mock('#lib/admin/db', () => ({
  getAdminData: () => mockGetAdminData(),
  getCreatorAliasesAdminData: () => mockGetCreatorAliasesAdminData(),
}))

vi.mock('./AdminDashboard', () => ({
  default: ({
    characters,
    commissions,
  }: {
    characters: Array<{ id: number }>
    commissions: Array<{ id: number }>
    creatorAliases: Array<unknown>
  }) => <div data-testid="admin-dashboard">{`${characters.length}:${commissions.length}`}</div>,
}))

describe('AdminPage', () => {
  beforeEach(() => {
    mockNotFound.mockClear()
    mockGetAdminData.mockClear()
    mockGetCreatorAliasesAdminData.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('calls notFound in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(mockGetAdminData).not.toHaveBeenCalled()
  })

  it('renders admin dashboard in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const element = await AdminPage()
    render(element)

    expect(screen.getByTestId('admin-dashboard')).toHaveTextContent('1:1')
    expect(mockGetAdminData).toHaveBeenCalledTimes(1)
    expect(mockGetCreatorAliasesAdminData).toHaveBeenCalledTimes(1)
  })
})
