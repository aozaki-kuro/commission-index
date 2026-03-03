import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './router'
import { getBootstrappedSitePayload } from '#lib/sitePayloadBootstrap'

import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '#styles/globals.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing root element.')
}

void getBootstrappedSitePayload()

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)

if (rootElement.dataset.prerendered === 'home') {
  hydrateRoot(rootElement, app)
} else {
  createRoot(rootElement).render(app)
}
