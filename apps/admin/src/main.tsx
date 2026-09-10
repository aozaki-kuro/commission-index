import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/globals.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root element')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
