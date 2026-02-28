import path from 'node:path'

import { runImageConversion, runImageImportWorkflow, runImageWorkflow } from '#lib/pipeline/images'

type CliMode = 'all' | 'convert-only' | 'import-only'

type ImageCliArgs = {
  mode: CliMode
  strict: boolean
  cleanUnused: boolean
}

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
} as const

const printHelp = () => {
  console.log(
    [
      'Usage: bun run scripts/images.ts [options]',
      '',
      'Options:',
      '  --all             Run conversion + import generation (default)',
      '  --convert-only    Run conversion only',
      '  --import-only     Run import generation only',
      '  --prune-unused    Remove unused webp files while generating imports',
      '  --strict          Fail if unresolved image mappings exist',
      '  --help            Show this message',
    ].join('\n'),
  )
}

const parseCliArgs = (argv: string[]): ImageCliArgs => {
  let mode: CliMode = 'all'
  let strict = process.env.IMAGE_IMPORT_STRICT === '1'
  let cleanUnused = process.env.IMAGE_CLEAN_UNUSED === '1'

  for (const arg of argv) {
    if (arg === '--all') mode = 'all'
    else if (arg === '--convert-only') mode = 'convert-only'
    else if (arg === '--import-only') mode = 'import-only'
    else if (arg === '--prune-unused') cleanUnused = true
    else if (arg === '--strict') strict = true
    else if (arg === '--help') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown images option: ${arg}`)
    }
  }

  return { mode, strict, cleanUnused }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('images')) {
  ;(async () => {
    const cliArgs = parseCliArgs(process.argv.slice(2))

    if (cliArgs.mode === 'convert-only') {
      await runImageConversion()
      return
    }

    if (cliArgs.mode === 'import-only') {
      runImageImportWorkflow({
        strict: cliArgs.strict,
        cleanUnused: cliArgs.cleanUnused,
      })
      return
    }

    await runImageWorkflow({
      strict: cliArgs.strict,
      cleanUnused: cliArgs.cleanUnused,
    })
  })().catch(error => {
    console.error(`${MSG.ERROR} ${error}`)
    process.exit(1)
  })
}
