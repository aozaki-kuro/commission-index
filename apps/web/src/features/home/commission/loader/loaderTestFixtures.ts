const EMPTY_CHARACTER_MANIFEST_SIDE = {
  initialSectionIds: [] as string[],
  totalBatches: 0,
  targetBatchById: {} as Record<string, number>,
  batchVersions: [] as string[],
}

/** Fresh character manifest as served by `/search/home-character-manifest/`. */
export function createFreshCharacterManifest({
  status,
  targetBatchById,
  batchVersions,
  initialSectionIds = [],
}: {
  status: 'active' | 'archived'
  targetBatchById: Record<string, number>
  batchVersions: string[]
  initialSectionIds?: string[]
}) {
  const side = {
    initialSectionIds,
    totalBatches: batchVersions.length,
    targetBatchById,
    batchVersions,
  }

  return {
    locale: 'en',
    v: 'fresh-v',
    active: status === 'active' ? side : EMPTY_CHARACTER_MANIFEST_SIDE,
    archived: status === 'archived' ? side : EMPTY_CHARACTER_MANIFEST_SIDE,
  }
}

/** Single-section character batch payload as served by `/search/home-character-batches/`. */
export function createCharacterBatchPayload({
  status,
  batchIndex,
  sectionId,
  displayName,
  entryId,
}: {
  status: 'active' | 'archived'
  batchIndex: number
  sectionId: string
  displayName: string
  entryId: string
}) {
  return {
    batchIndex,
    status,
    sections: [
      {
        sectionId,
        titleId: `title-${sectionId}`,
        sectionHash: `#${sectionId}`,
        displayName,
        totalCommissions: 1,
        toBeAnnouncedText: 'TBA',
        entries: [
          {
            id: entryId,
            sectionId,
            searchKey: `${sectionId}::${entryId}`,
            searchText: `${displayName.toLowerCase()} 2024`,
            searchSuggest: `Character\t${displayName}`,
            altText: `(c) 2024 ${displayName} & Crystallize`,
            image: null,
            sourceImageNotFoundText: 'Source image not found',
            timeLabel: '2024/01/01',
            primaryText: displayName,
            secondaryText: null,
            links: [],
            interest: null,
          },
        ],
      },
    ],
  }
}

/** Fresh timeline manifest as served by `/search/home-timeline-manifest/`. */
export function createFreshTimelineManifest() {
  return {
    locale: 'en',
    v: 'fresh-v',
    batchVersions: ['bv0', 'bv1', 'bv2'],
    initialSectionIds: ['timeline-year-2026'],
    totalBatches: 3,
    targetBatchById: {
      'timeline-year-2025': 0,
      'timeline-year-2024': 1,
      'timeline-year-2023': 2,
    },
  }
}

/**
 * Drains pending microtasks and timers. Only needed for tests that assert something did NOT
 * happen — positive assertions should use `vi.waitFor` on observable state instead.
 */
export async function flushAsyncWork(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

/**
 * Builds a fetch handler that returns the routed body for the first matching URL prefix and a
 * 404 otherwise. Wrap it in `vi.fn()` to inspect calls.
 */
export function createUrlDispatchFetchHandler(
  routes: Array<[prefix: string, body: unknown]>,
) {
  return async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const route = routes.find(([prefix]) => url.startsWith(prefix))
    return route ? new Response(JSON.stringify(route[1])) : new Response(null, { status: 404 })
  }
}
