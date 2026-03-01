import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { generateRssFeed } from '#lib/rss/feed'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'public', 'rss.xml')

await mkdir(path.dirname(outputPath), { recursive: true })
const payload = `${generateRssFeed()}\n`
const result = await writeFileIfChanged(outputPath, payload)
const relativeOutputPath = path.relative(process.cwd(), outputPath)

if (result === 'unchanged') {
  console.log(`RSS feed unchanged -> ${relativeOutputPath}`)
} else {
  console.log(`Generated RSS feed -> ${relativeOutputPath}`)
}
