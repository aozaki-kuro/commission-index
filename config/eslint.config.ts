import antfu from '@antfu/eslint-config'

const eslintConfig = antfu({
  astro: true,
  typescript: true,
  test: true,
  // React rules scoped to apps/admin only (apps/web is vanilla TS)
  react: {
    files: ['apps/admin/**/*.{ts,tsx}'],
  },
  ignores: ['**/.wrangler/**', '**/.claude/**', 'docs/**', '.superpowers/**'],
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },
})

export default eslintConfig
