import antfu from '@antfu/eslint-config'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'

const eslintConfig = antfu({
  astro: true,
  typescript: true,
  test: true,
  react: true,
  formatters: {
    /**
     * Format CSS, LESS, SCSS files, also the `<style>` blocks in Vue
     * By default uses Prettier
     */
    css: true,
    /**
     * Format HTML files
     * By default uses Prettier
     */
    html: true,
    /**
     * Format Markdown files
     * Supports Prettier and dprint
     * By default uses Prettier
     */
    // markdown: 'prettier',
  },
})

eslintConfig.append({
  plugins: {
    'better-tailwindcss': betterTailwindcss,
  },
  rules: {
    ...betterTailwindcss.configs.recommended.rules,
  },
})

export default eslintConfig
