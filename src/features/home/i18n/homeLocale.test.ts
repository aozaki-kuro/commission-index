import { describe, expect, it } from 'vitest'
import { getHomeLocaleMessages } from '#features/home/i18n/homeLocale'

describe('homeLocale stale summary formatter', () => {
  it('formats english stale character summary with both counts', () => {
    const messages = getHomeLocaleMessages('en')

    expect(messages.controls.formatCollapsedStaleSummary(2, 31)).toBe(
      '2 Stale Characters / 31 commissions',
    )
    expect(messages.controls.formatCollapsedStaleSummary(1, 1)).toBe(
      '1 Stale Character / 1 commission',
    )
  })

  it('formats traditional chinese stale character summary with both counts', () => {
    const messages = getHomeLocaleMessages('zh-tw')

    expect(messages.controls.formatCollapsedStaleSummary(2, 31)).toBe('2 位停更角色 / 31 筆委託')
  })

  it('formats japanese stale character summary with both counts', () => {
    const messages = getHomeLocaleMessages('ja')

    expect(messages.controls.formatCollapsedStaleSummary(2, 31)).toBe(
      '2人の停止中キャラクター / 31件のコミッション',
    )
  })
})
