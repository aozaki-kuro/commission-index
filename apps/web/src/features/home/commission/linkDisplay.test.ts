import { describe, expect, it } from 'vitest'
import { hasDisplayableLinks, selectDisplayLinks } from './linkDisplay'

describe('linkDisplay', () => {
  it('selects links by priority', () => {
    const result = selectDisplayLinks({
      links: [
        'https://pixiv.net/artworks/1',
        'https://x.com/example/status/1',
        'https://patreon.com/post/1',
        'https://fantia.jp/posts/1',
      ],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Twitter', url: 'https://x.com/example/status/1' },
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
    expect(result.designLink).toBe('https://x.com/example/status/2')
  })

  it('reports whether any displayable link exists', () => {
    expect(hasDisplayableLinks({ links: [] })).toBe(false)
    expect(hasDisplayableLinks({
      links: ['https://example.com/no-match'],
    })).toBe(false)
    expect(hasDisplayableLinks({ links: [], designLink: 'https://example.com/design' })).toBe(true)
    expect(hasDisplayableLinks({
      links: ['https://twitter.com/example/status/1'],
    })).toBe(true)
  })

  it('numbers same-platform parts when there are multiple', () => {
    const result = selectDisplayLinks({
      links: [
        'https://www.pixiv.net/artworks/144567573',
        'https://www.pixiv.net/artworks/144613740',
      ],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Pixiv 1', url: 'https://www.pixiv.net/artworks/144567573' },
      { type: 'Pixiv 2', url: 'https://www.pixiv.net/artworks/144613740' },
    ])
    expect(result.designLink).toBeNull()
  })

  it('numbers three same-platform parts and fills the slot budget', () => {
    const result = selectDisplayLinks({
      links: [
        'https://www.pixiv.net/artworks/1',
        'https://www.pixiv.net/artworks/2',
        'https://www.pixiv.net/artworks/3',
      ],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Pixiv 1', url: 'https://www.pixiv.net/artworks/1' },
      { type: 'Pixiv 2', url: 'https://www.pixiv.net/artworks/2' },
      { type: 'Pixiv 3', url: 'https://www.pixiv.net/artworks/3' },
    ])
  })

  it('keeps priority order and numbers multipart entries within their platform', () => {
    const result = selectDisplayLinks({
      links: [
        'https://www.pixiv.net/artworks/1',
        'https://x.com/example/status/1',
        'https://www.pixiv.net/artworks/2',
      ],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Twitter', url: 'https://x.com/example/status/1' },
      { type: 'Pixiv 1', url: 'https://www.pixiv.net/artworks/1' },
      { type: 'Pixiv 2', url: 'https://www.pixiv.net/artworks/2' },
    ])
  })

  it('truncates trailing multipart entries when a design link tightens the budget', () => {
    const result = selectDisplayLinks({
      links: [
        'https://x.com/example/status/1',
        'https://www.pixiv.net/artworks/1',
        'https://www.pixiv.net/artworks/2',
      ],
      designLink: 'https://x.com/example/status/2',
    })

    expect(result.mainLinks).toEqual([
      { type: 'Twitter', url: 'https://x.com/example/status/1' },
      { type: 'Pixiv 1', url: 'https://www.pixiv.net/artworks/1' },
    ])
    expect(result.designLink).toBe('https://x.com/example/status/2')
  })

  it('does not number a single same-platform link', () => {
    const result = selectDisplayLinks({
      links: ['https://www.pixiv.net/artworks/1'],
    })

    expect(result.mainLinks).toEqual([
      { type: 'Pixiv', url: 'https://www.pixiv.net/artworks/1' },
    ])
  })
})
