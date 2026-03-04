import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.tsx'],
    include: [
      'data/commissionData.real.test.ts',
      'data/creatorAliases.test.ts',
      'src/lib/search/index.test.ts',
      'src/lib/date/search.test.ts',
      'src/lib/navigation/hashAnchor.test.ts',
      'src/lib/navigation/jumpToCommissionSearch.test.ts',
      'src/lib/commissions/index.test.ts',
      'src/lib/admin/db.crud.test.ts',
      'src/lib/admin/db.aliases.test.ts',
      'src/features/admin/search/commissionSearchMetadata.test.ts',
      'src/features/home/search/CommissionSearch.test.tsx',
    ],
  },
})
