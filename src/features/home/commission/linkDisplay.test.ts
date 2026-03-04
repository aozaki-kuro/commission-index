import { describe, expect, it } from 'vitest'
import { hasDisplayableLinks, selectDisplayLinks } from './linkDisplay'

describe('linkDisplay', () => {
  it('selects links by priority and normalizes x.com', () => {
    const result = selectDisplayLinks({
      links: [
        'https://pixiv.net/artworks/1',
        'https://x.com/example/status/1',
        'https://patreon.com/post/1',
        'https://fantia.jp/posts/1',
      ],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Twitter', url: 'https://twitter.com/example/status/1' },
      { type: 'Pixiv', url: 'https://pixiv.net/artworks/1' },
      { type: 'Patreon', url: 'https://patreon.com/post/1' },
    ])
    expect(result.designLink).toBeNull()
  })

  it('limits primary links to 2 when design link exists', () => {
    const result = selectDisplayLinks({
      links: [
        'https://twitter.com/example/status/1',
        'https://pixiv.net/artworks/1',
        'https://fantia.jp/posts/1',
      ],
      designLink: 'https://x.com/example/status/2',
    })

    expect(result.mainLinks).toEqual([
      { type: 'Twitter', url: 'https://twitter.com/example/status/1' },
      { type: 'Pixiv', url: 'https://pixiv.net/artworks/1' },
    ])
    expect(result.designLink).toBe('https://twitter.com/example/status/2')
  })

  it('reports whether any displayable link exists', () => {
    expect(hasDisplayableLinks({ links: [] })).toBe(false)
    expect(hasDisplayableLinks({ links: ['https://example.com/no-match'] })).toBe(false)
    expect(hasDisplayableLinks({ links: [], designLink: 'https://example.com/design' })).toBe(true)
    expect(hasDisplayableLinks({ links: ['https://twitter.com/example/status/1'] })).toBe(true)
  })
})
