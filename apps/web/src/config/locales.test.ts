import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WEB_LOCALE, WEB_LOCALES } from './locales'

const pagesDir = fileURLToPath(new URL('../pages', import.meta.url))

describe('web locales', () => {
  it('has a static page for every non-default locale', () => {
    for (const locale of WEB_LOCALES) {
      if (locale === DEFAULT_WEB_LOCALE)
        continue

      expect(existsSync(`${pagesDir}/${locale}/index.astro`), `missing pages/${locale}/index.astro`).toBe(true)
    }
  })
})
