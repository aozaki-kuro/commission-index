import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierConfigRecommended from 'eslint-plugin-prettier/recommended'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const codeFiles = ['**/*.{js,mjs,cjs,jsx,ts,tsx}']

const eslintConfig = defineConfig([
  globalIgnores(['.next/**', 'dist/**', 'out/**', 'build/**', 'coverage/**']),
  {
    files: codeFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{test,spec}.{js,mjs,cjs,jsx,ts,tsx}', 'test/**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: codeFiles,
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript types already validate props contracts.
      'react/prop-types': 'off',
      'react/display-name': 'off',

      // Path aliases are resolved by Vite/TS config.
      'import/no-unresolved': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',

      // Keep signal high, avoid noisy hard-fail on current codebase.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/newline-after-import': ['warn', { count: 1 }],
      'import/no-duplicates': 'error',
      'import/first': 'error',

      // Useful defaults, but currently noisy with custom primitives and legacy handlers.
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/anchor-has-content': 'off',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    },
  },
  prettierConfigRecommended,
])

export default eslintConfig
