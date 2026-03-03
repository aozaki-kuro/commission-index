import { runImageWorkflow } from '#lib/pipeline/images'
import { generateHomeSearchEntriesFile } from './homeSearchEntries'
import { generateHomeUpdateSummaryModule } from './homeUpdateSummary'
import { generateRssFile } from './rss'
import { generateSitePayloadFile } from './sitePayload'

type AssetsMode = 'dev' | 'build'

export type AssetTask =
  | 'site-payload'
  | 'home-update-summary'
  | 'home-search-entries'
  | 'rss'
  | 'images'

const TASK_ORDER: AssetTask[] = [
  'site-payload',
  'home-update-summary',
  'home-search-entries',
  'rss',
  'images',
]

const DEFAULT_TASKS_BY_MODE: Record<AssetsMode, AssetTask[]> = {
  dev: ['site-payload', 'home-update-summary', 'home-search-entries'],
  build: ['site-payload', 'home-update-summary', 'home-search-entries', 'rss', 'images'],
}

const TASK_RUNNERS: Record<AssetTask, () => Promise<void>> = {
  'site-payload': generateSitePayloadFile,
  'home-update-summary': generateHomeUpdateSummaryModule,
  'home-search-entries': generateHomeSearchEntriesFile,
  rss: generateRssFile,
  images: async () => {
    await runImageWorkflow()
  },
}

const VALID_TASKS = new Set(TASK_ORDER)

const printHelp = () => {
  console.log(
    [
      'Usage: bun run scripts/assets.ts [options]',
      '',
      'Options:',
      '  --mode <dev|build>  Select default task set (default: dev)',
      '  --task <name>       Add one task (repeatable)',
      '  --tasks a,b,c       Add multiple tasks',
      '  --reason <text>     Optional log context',
      '  --help              Show this message',
      '',
      `Available tasks: ${TASK_ORDER.join(', ')}`,
    ].join('\n'),
  )
}

const parseTaskList = (raw: string): AssetTask[] =>
  raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      if (!VALID_TASKS.has(item as AssetTask)) {
        throw new Error(`Unknown asset task: ${item}`)
      }
      return item as AssetTask
    })

const toOrderedUniqueTasks = (tasks: AssetTask[]): AssetTask[] => {
  const selected = new Set(tasks)
  return TASK_ORDER.filter(task => selected.has(task))
}

export const resolveTasks = ({ mode, tasks }: { mode: AssetsMode; tasks: AssetTask[] }) =>
  tasks.length === 0 ? DEFAULT_TASKS_BY_MODE[mode] : toOrderedUniqueTasks(tasks)

const parseCliArgs = (argv: string[]) => {
  let mode: AssetsMode = 'dev'
  const requestedTasks: AssetTask[] = []
  let reason = ''

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') {
      printHelp()
      process.exit(0)
    }

    if (arg === '--mode') {
      const value = argv[index + 1]
      if (value !== 'dev' && value !== 'build') {
        throw new Error('--mode must be "dev" or "build"')
      }
      mode = value
      index += 1
      continue
    }

    if (arg === '--task') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--task requires a task name')
      }
      requestedTasks.push(...parseTaskList(value))
      index += 1
      continue
    }

    if (arg === '--tasks') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--tasks requires a comma-separated list')
      }
      requestedTasks.push(...parseTaskList(value))
      index += 1
      continue
    }

    if (arg === '--reason') {
      reason = argv[index + 1] ?? ''
      index += 1
      continue
    }

    throw new Error(`Unknown option: ${arg}`)
  }

  return {
    mode,
    tasks: requestedTasks,
    reason,
  }
}

export const runAssets = async ({
  mode,
  tasks,
  reason,
}: {
  mode: AssetsMode
  tasks: AssetTask[]
  reason?: string
}) => {
  const selectedTasks = resolveTasks({ mode, tasks })
  const reasonSuffix = reason ? ` (${reason})` : ''
  console.log(`[assets] mode=${mode} tasks=${selectedTasks.join(', ')}${reasonSuffix}`)

  for (const task of selectedTasks) {
    console.log(`[assets] start ${task}`)
    await TASK_RUNNERS[task]()
    console.log(`[assets] done ${task}`)
  }
}

if (import.meta.main) {
  const args = parseCliArgs(process.argv.slice(2))
  await runAssets(args).catch(error => {
    console.error(`[assets] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
