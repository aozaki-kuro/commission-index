import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { generateRssFeed } from '../rss/feed'
import { createAstroStyleLogger } from './astroLogger'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'public', 'rss.xml')
const logger = createAstroStyleLogger('assets')

export async function generateRssFile() {
  await mkdir(path.dirname(outputPath), { recursive: true })
  const payload = `${generateRssFeed()}\n`
  const result = await writeFileIfChanged(outputPath, payload)
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    logger.info(`rss feed unchanged -> ${relativeOutputPath}`)
  }
  else {
    logger.success(`generated rss feed -> ${relativeOutputPath}`)
  }
}
