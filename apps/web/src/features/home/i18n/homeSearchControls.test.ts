import { describe, expect, it } from 'vitest'
import { resolveHomeSearchControls } from './homeSearchControls'

describe('home search load failure controls', () => {
  it('provides localized failure and retry labels for every supported locale', () => {
    const english = resolveHomeSearchControls('en')
    const chinese = resolveHomeSearchControls('zh-tw')
    const japanese = resolveHomeSearchControls('ja')

    expect(english.activeCharactersLoadFailed).toContain('Could not load')
    expect(english.retryActiveCharactersLoad).toBe('Retry loading')
    expect(chinese.activeCharactersLoadFailed).toContain('無法載入')
    expect(chinese.retryActiveCharactersLoad).toBe('重試載入')
    expect(japanese.activeCharactersLoadFailed).toContain('読み込めませんでした')
    expect(japanese.retryActiveCharactersLoad).toBe('再読み込み')
  })
})
