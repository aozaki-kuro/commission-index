/// <reference types="vite/client" />

import type { SitePayload } from '#lib/sitePayload'

declare global {
  interface Window {
    __SITE_PAYLOAD__?: SitePayload
  }
}
