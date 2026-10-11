import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

// Must match the first character in apps/admin-worker/scripts/webVisualFixture.ts. It is a copy rather than an
// import because apps/web must not depend on apps/admin-worker.
const FIXTURE_CHARACTER_NAME = 'Lumi Verde'

// A reused orphan server (reuseExistingServer) may still serve real data; fail loudly before any layout assertion
// or screenshot instead of producing real-data output.
export async function expectFixtureData(page: Page) {
  await expect(
    page.locator('[id="Character List"]').getByText(FIXTURE_CHARACTER_NAME).first(),
    'page is not rendering the visual fixture; a stale non-fixture server may be running on the port',
  ).toBeAttached()
}
