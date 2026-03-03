import path from 'node:path'

import { getCharacterStatus } from '#data/commissionStatus'
import { getCommissionData } from '#data/commissionData'
import { buildHomeUpdateSummary, type HomeUpdateSummary } from '#lib/home/updateSummary'
import { mkdir } from 'node:fs/promises'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'src', 'lib', 'generated', 'homeUpdateSummary.ts')

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const buildModuleSource = (summary: HomeUpdateSummary) => {
  const entryLines = summary.entries.map(
    entry => `    {
      key: ${quote(entry.key)},
      character: ${quote(entry.character)},
      href: ${quote(entry.href)},
      dateLabel: ${quote(entry.dateLabel)},
    },`,
  )

  return `import type { HomeUpdateSummary } from '#lib/home/updateSummary'

export const homeUpdateSummary: HomeUpdateSummary = {
  totalCommissions: ${summary.totalCommissions},
  entries: [
${entryLines.join('\n')}
  ],
}
`
}

export const generateHomeUpdateSummaryModule = async () => {
  const commissionData = getCommissionData()
  const characterStatus = getCharacterStatus()
  const activeCharacters = characterStatus.active.map(item => item.DisplayName)
  const summary = buildHomeUpdateSummary(commissionData, activeCharacters)

  await mkdir(path.dirname(outputPath), { recursive: true })
  const result = await writeFileIfChanged(outputPath, buildModuleSource(summary))
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    console.log(`Home update summary unchanged -> ${relativeOutputPath}`)
  } else {
    console.log(`Generated home update summary -> ${relativeOutputPath}`)
  }
}

if (import.meta.main) {
  await generateHomeUpdateSummaryModule()
}
