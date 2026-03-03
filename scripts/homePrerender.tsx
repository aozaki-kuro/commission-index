import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { buildSitePayload } from '#lib/home/buildSitePayload'

import AppShell from '../src/AppShell'
import HomePage from '../src/pages/home/HomePage'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'public', 'data', 'home-prerender.html')

const buildHomePrerenderHtml = () => {
  const sitePayload = buildSitePayload()
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <AppShell>
        <HomePage bootstrapPayload={sitePayload} />
      </AppShell>
    </MemoryRouter>,
  )
}

export const generateHomePrerenderFile = async () => {
  await mkdir(path.dirname(outputPath), { recursive: true })
  const result = await writeFileIfChanged(outputPath, `${buildHomePrerenderHtml()}\n`)
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    console.log(`Home prerender unchanged -> ${relativeOutputPath}`)
  } else {
    console.log(`Generated home prerender -> ${relativeOutputPath}`)
  }
}

if (import.meta.main) {
  await generateHomePrerenderFile()
}
