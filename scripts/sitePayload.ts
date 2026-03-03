import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { buildSitePayload } from '#lib/home/buildSitePayload'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'public', 'data', 'site-payload.json')

export const generateSitePayloadFile = async () => {
  const payload = buildSitePayload()

  await mkdir(path.dirname(outputPath), { recursive: true })
  const result = await writeFileIfChanged(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    console.log(`Site payload unchanged -> ${relativeOutputPath}`)
  } else {
    console.log(`Generated site payload -> ${relativeOutputPath}`)
  }
}

if (import.meta.main) {
  await generateSitePayloadFile()
}
