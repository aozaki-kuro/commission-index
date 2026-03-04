import { runFullAssetPipeline } from '../src/lib/pipeline/assets'

const parseReason = (args: string[]) => {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--reason') {
      return args[index + 1] ?? 'manual'
    }
  }
  return 'manual'
}

const reason = parseReason(process.argv.slice(2))

await runFullAssetPipeline(reason).catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[assets-sync] ${message}`)
  process.exit(1)
})
