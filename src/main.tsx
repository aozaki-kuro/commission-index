import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './router'

import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '#styles/globals.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing root element.')
}

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)

createRoot(rootElement).render(app)
