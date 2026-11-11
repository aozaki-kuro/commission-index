import type { OptionsReact } from '@antfu/eslint-config'
import antfu from '@antfu/eslint-config'

const eslintConfig = antfu({
  astro: true,
  typescript: true,
  test: true,
  // React rules scoped to apps/admin only (apps/web is vanilla TS)
  // TODO(upstream-type): react() reads `files` at runtime, but the published OptionsReact type omits it.
  react: {
    files: ['apps/admin/**/*.{ts,tsx}'],
  } as OptionsReact,
  ignores: [
    '**/.wrangler/**',
    '**/.claude/**',
    'docs/**',
    '.superpowers/**',
  ],
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },
})

export default eslintConfig
