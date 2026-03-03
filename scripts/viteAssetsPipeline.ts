import path from 'node:path'

import type { Plugin } from 'vite'

import { runAssets, type AssetTask } from './assets'

type AssetsCommand = 'assets:dev' | 'assets:build'

const GENERATED_OUTPUTS = new Set(
  [
    'public/data/site-payload.json',
    'public/data/home-prerender.html',
    'src/lib/generated/homeUpdateSummary.ts',
    'public/search/home-search-entries.json',
    'public/rss.xml',
  ].map(file => path.resolve(process.cwd(), file)),
)

const TASK_ORDER: AssetTask[] = [
  'site-payload',
  'home-update-summary',
  'home-search-entries',
  'home-prerender',
  'rss',
  'images',
]

const HOT_UPDATE_RULES: { pattern: RegExp; tasks: AssetTask[] }[] = [
  {
    pattern: /[/\\]data[/\\](?!images[/\\])/,
    tasks: ['site-payload', 'home-update-summary', 'home-search-entries'],
  },
  {
    pattern: /[/\\]src[/\\]lib[/\\]sitePayload\.ts$/,
    tasks: ['site-payload'],
  },
  {
    pattern: /[/\\]scripts[/\\]sitePayload\.ts$/,
    tasks: ['site-payload'],
  },
  {
    pattern: /[/\\]src[/\\]lib[/\\]home[/\\]updateSummary\.ts$/,
    tasks: ['home-update-summary'],
  },
  {
    pattern: /[/\\]scripts[/\\]homeUpdateSummary\.ts$/,
    tasks: ['home-update-summary'],
  },
  {
    pattern: /[/\\]src[/\\]lib[/\\]search[/\\]commissionSearchMetadata\.ts$/,
    tasks: ['home-search-entries'],
  },
  {
    pattern: /[/\\]src[/\\]lib[/\\]characters[/\\]nav\.ts$/,
    tasks: ['home-search-entries'],
  },
  {
    pattern: /[/\\]scripts[/\\]homeSearchEntries\.ts$/,
    tasks: ['home-search-entries'],
  },
  {
    pattern: /[/\\]src[/\\]lib[/\\]rss[/\\]feed\.ts$/,
    tasks: ['rss'],
  },
  {
    pattern: /[/\\]scripts[/\\]rss\.ts$/,
    tasks: ['rss'],
  },
]

const isGeneratedOutput = (absolutePath: string) => GENERATED_OUTPUTS.has(absolutePath)

const resolveHotUpdateTasks = (absolutePath: string): AssetTask[] => {
  const selectedTasks = new Set<AssetTask>()
  for (const rule of HOT_UPDATE_RULES) {
    if (!rule.pattern.test(absolutePath)) continue
    for (const task of rule.tasks) {
      selectedTasks.add(task)
    }
  }
  return TASK_ORDER.filter(task => selectedTasks.has(task))
}

export const viteAssetsPipeline = ({
  command,
  watch,
}: {
  command: AssetsCommand
  watch: boolean
}): Plugin => {
  const mode = command === 'assets:build' ? 'build' : 'dev'
  let pendingTasks = new Set<AssetTask>()
  const pendingReasons: string[] = []
  let pipelineRun = Promise.resolve()

  const queueAssets = (tasks: AssetTask[], reason: string) => {
    if (tasks.length > 0) {
      for (const task of tasks) {
        pendingTasks.add(task)
      }
    }
    pendingReasons.push(reason)

    pipelineRun = pipelineRun
      .catch(() => undefined)
      .then(async () => {
        while (pendingReasons.length > 0) {
          const tasksToRun = TASK_ORDER.filter(task => pendingTasks.has(task))
          pendingTasks = new Set<AssetTask>()
          const runReason = pendingReasons.splice(0).join(', ')
          console.log(
            `[assets] queued mode=${mode} tasks=${
              tasksToRun.length > 0 ? tasksToRun.join(', ') : 'default'
            } (${runReason})`,
          )
          await runAssets({
            mode,
            tasks: tasksToRun,
            reason: runReason,
          })
        }
      })

    return pipelineRun
  }

  return {
    name: 'vite-assets-pipeline',
    async buildStart() {
      await queueAssets([], 'startup')
    },
    async handleHotUpdate(ctx) {
      if (!watch) return

      const changedFile = path.resolve(ctx.file)
      if (isGeneratedOutput(changedFile)) return

      const tasks = resolveHotUpdateTasks(changedFile)
      if (tasks.length === 0) return

      await queueAssets(tasks, path.relative(process.cwd(), changedFile))
      ctx.server.ws.send({ type: 'full-reload' })
    },
  }
}
