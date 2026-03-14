import { createAstroStyleLogger } from './astroLogger'
import { generateHomeSearchEntriesFile } from './homeSearchEntries'
import { generateHomeUpdateSummaryModule } from './homeUpdateSummary'
import { generateRssFile } from './rss'

export type AssetTask = 'home-update-summary' | 'home-search-entries' | 'rss'

const FULL_TASK_ORDER: AssetTask[] = ['home-update-summary', 'home-search-entries', 'rss']

const TASK_RUNNERS: Record<AssetTask, () => Promise<void>> = {
  'home-update-summary': generateHomeUpdateSummaryModule,
  'home-search-entries': generateHomeSearchEntriesFile,
  'rss': generateRssFile,
}

const logger = createAstroStyleLogger('assets')

async function runTasks(tasks: AssetTask[], reason: string) {
  const reasonSuffix = reason ? ` (${reason})` : ''
  logger.info(`tasks=${tasks.join(', ')}${reasonSuffix}`)

  for (const task of tasks) {
    logger.info(`start ${task}`)
    await TASK_RUNNERS[task]()
    logger.success(`done ${task}`)
  }
}

export async function runFullAssetPipeline(reason: string) {
  await runTasks(FULL_TASK_ORDER, reason)
}
