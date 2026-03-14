import antfu from '@antfu/eslint-config'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'

const eslintConfig = antfu({
  astro: true,
  typescript: true,
  test: true,
  react: true,
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
