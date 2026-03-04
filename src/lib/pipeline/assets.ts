import { runImageWorkflow } from './images'
import { generateHomeSearchEntriesFile } from './homeSearchEntries'
import { generateHomeUpdateSummaryModule } from './homeUpdateSummary'
import { generateRssFile } from './rss'

export type AssetTask = 'home-update-summary' | 'home-search-entries' | 'rss' | 'images'

const FULL_TASK_ORDER: AssetTask[] = ['home-update-summary', 'home-search-entries', 'rss', 'images']

const TASK_RUNNERS: Record<AssetTask, () => Promise<void>> = {
  'home-update-summary': generateHomeUpdateSummaryModule,
  'home-search-entries': generateHomeSearchEntriesFile,
  rss: generateRssFile,
  images: async () => {
    await runImageWorkflow()
  },
}

const runTasks = async (tasks: AssetTask[], reason: string) => {
  const reasonSuffix = reason ? ` (${reason})` : ''
  console.log(`[assets] tasks=${tasks.join(', ')}${reasonSuffix}`)

  for (const task of tasks) {
    console.log(`[assets] start ${task}`)
    await TASK_RUNNERS[task]()
    console.log(`[assets] done ${task}`)
  }
}

export const runFullAssetPipeline = async (reason: string) => {
  await runTasks(FULL_TASK_ORDER, reason)
}
