import { mountMobileViewModeTabs } from '@features/home/commission/mobileViewModeTabs'
import { mountScrollDepthTracker } from '@features/home/commission/scrollDepthTracker'
import { mountScrollReveal } from '@features/home/commission/scrollReveal'
import { mountUnpublishedInterestButtons } from '@features/home/commission/unpublishedInterestClient'
import { mountFloatingButtonsAutoHide } from '@features/home/nav/hamburger/floatingButtonsAutoHide'
import { mountMobileHamburgerMenu } from '@features/home/nav/hamburger/mobileHamburgerMenu'
import { mountMobileKeywordButton } from '@features/home/nav/hamburger/mobileKeywordButton'
import { mountSidebarNavEnhancer } from '@features/home/nav/sidebarNavEnhancer'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'

// Loaded by homePageClient.ts through one dynamic import() at idle, so none of these features sit in the eager
// entry chunk. Mount order lives in homePageClient.ts.
export const deferredMounts = {
  mountSidebarNavEnhancer: () => mountSidebarNavEnhancer(),
  mountMobileHamburgerMenu: () => mountMobileHamburgerMenu(),
  mountMobileKeywordButton: () => mountMobileKeywordButton(),
  mountMobileViewModeTabs: () => mountMobileViewModeTabs(),
  mountUnpublishedInterestButtons: () =>
    mountUnpublishedInterestButtons({
      trackEvent: (properties) => {
        trackRybbitEvent(ANALYTICS_EVENTS.iWantToSeeIt, {
          commission: properties.commission,
        })
      },
    }),
  mountScrollReveal: () => mountScrollReveal(),
  mountFloatingButtonsAutoHide: () => mountFloatingButtonsAutoHide(),
  mountScrollDepthTracker: () =>
    mountScrollDepthTracker({
      trackEvent: (properties) => {
        trackRybbitEvent(ANALYTICS_EVENTS.scrollDepthReached, { ...properties })
      },
    }),
} satisfies Record<string, () => () => void>

export type DeferredMounts = typeof deferredMounts
