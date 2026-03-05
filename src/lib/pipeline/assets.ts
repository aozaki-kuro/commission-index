import { generateHomeSearchEntriesFile } from './homeSearchEntries'
import { generateHomeUpdateSummaryModule } from './homeUpdateSummary'
import { createAstroStyleLogger } from './astroLogger'
import { generateRssFile } from './rss'

export type AssetTask = 'home-update-summary' | 'home-search-entries' | 'rss'

const FULL_TASK_ORDER: AssetTask[] = ['home-update-summary', 'home-search-entries', 'rss']

const TASK_RUNNERS: Record<AssetTask, () => Promise<void>> = {
  'home-update-summary': generateHomeUpdateSummaryModule,
  'home-search-entries': generateHomeSearchEntriesFile,
  rss: generateRssFile,
}

const logger = createAstroStyleLogger('assets')

const runTasks = async (tasks: AssetTask[], reason: string) => {
  const reasonSuffix = reason ? ` (${reason})` : ''
  logger.info(`tasks=${tasks.join(', ')}${reasonSuffix}`)

  for (const task of tasks) {
    logger.info(`start ${task}`)
    await TASK_RUNNERS[task]()
    logger.success(`done ${task}`)
  }
}

export const runFullAssetPipeline = async (reason: string) => {
  await runTasks(FULL_TASK_ORDER, reason)
}
