import { SiteMeta } from '@config/siteMeta'
import { getHomeLocaleMessages } from '@features/home/i18n/homeLocale'
import { describe, expect, it } from 'vitest'

describe('homeLocale archived summary formatter', () => {
  it.each([
    ['en', '2 Archived Characters / 31 commissions'],
    ['zh-tw', '2 位停更角色 / 31 筆委託'],
    ['ja', '停止中キャラクター 2 人 / コミッション 31 件'],
  ] as const)('formats %s archived character summary with both counts', (locale, expected) => {
    const messages = getHomeLocaleMessages(locale)

    expect(messages.controls.formatCollapsedArchivedSummary(2, 31)).toBe(expected)
  })

  it('formats english singular counts', () => {
    const messages = getHomeLocaleMessages('en')

    expect(messages.controls.formatCollapsedArchivedSummary(1, 1)).toBe(
      '1 Archived Character / 1 commission',
    )
  })
})

describe('homeLocale document metadata', () => {
  it.each(['en', 'zh-tw', 'ja'] as const)('defines non-empty %s title and description', (locale) => {
    const { meta } = getHomeLocaleMessages(locale)

    expect(meta.title.trim()).not.toBe('')
    expect(meta.description.trim()).not.toBe('')
  })

  it('keeps english metadata equal to the site defaults', () => {
    const { meta } = getHomeLocaleMessages('en')

    expect(meta.title).toBe(SiteMeta.site)
    expect(meta.description).toBe(SiteMeta.description)
  })
})
