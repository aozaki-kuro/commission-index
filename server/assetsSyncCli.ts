import { runFullAssetPipeline } from '../src/lib/pipeline/assets'
import { createAstroStyleLogger } from '../src/lib/pipeline/astroLogger'

const parseReason = (args: string[]) => {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--reason') {
      return args[index + 1] ?? 'manual'
    }
  }
  return 'manual'
}

const reason = parseReason(process.argv.slice(2))
const logger = createAstroStyleLogger('assets-sync')

await runFullAssetPipeline(reason).catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  logger.error(message)
  process.exit(1)
})
