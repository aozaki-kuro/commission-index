import type { HomeUpdateSummary } from '../home/updateSummary'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import { getCommissionData } from '../../../data/commissionData'
import { getCharacterStatus } from '../../../data/commissionStatus'
import { buildHomeUpdateSummary } from '../home/updateSummary'
import { createAstroStyleLogger } from './astroLogger'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'src', 'lib', 'generated', 'homeUpdateSummary.ts')
const logger = createAstroStyleLogger('assets')
const BACKSLASH_PATTERN = /\\/g
const SINGLE_QUOTE_PATTERN = /'/g

const quote = (value: string) => `'${value.replace(BACKSLASH_PATTERN, '\\\\').replace(SINGLE_QUOTE_PATTERN, '\\\'')}'`

function buildModuleSource(summary: HomeUpdateSummary) {
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

export async function generateHomeUpdateSummaryModule() {
  const commissionData = getCommissionData()
  const characterStatus = getCharacterStatus()
  const activeCharacters = characterStatus.active.map(item => item.DisplayName)
  const summary = buildHomeUpdateSummary(commissionData, activeCharacters)

  await mkdir(path.dirname(outputPath), { recursive: true })
  const result = await writeFileIfChanged(outputPath, buildModuleSource(summary))
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    logger.info(`home update summary unchanged -> ${relativeOutputPath}`)
  }
  else {
    logger.success(`generated home update summary -> ${relativeOutputPath}`)
  }
}
