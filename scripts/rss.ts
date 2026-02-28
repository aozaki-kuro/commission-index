import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { generateRssFeed } from '#lib/rss/feed'

const outputPath = path.join(process.cwd(), 'public', 'rss.xml')

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${generateRssFeed()}\n`)
console.log(`Generated RSS feed -> ${path.relative(process.cwd(), outputPath)}`)
