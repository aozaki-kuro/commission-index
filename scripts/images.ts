import path from 'node:path'

import { runImageConversion } from './convert'
import { generateImageImports } from './imageImport'

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
  SUCCESS: '\x1b[0m[\x1b[32m DONE \x1b[0m]',
  WARN: '\x1b[0m[\x1b[33m WARN \x1b[0m]',
} as const

export const runImageWorkflow = async () => {
  const conversion = await runImageConversion()
  const imports = generateImageImports()

  if (imports.unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Workflow completed with unresolved images (${imports.unresolved.length})`,
    )
  }

  console.log(
    `${MSG.SUCCESS} Image workflow completed: processed=${conversion.processed}, skipped=${conversion.skipped}, imports=${imports.importCount}`,
  )
  if (imports.cleaned.length > 0) {
    console.log(`${MSG.SUCCESS} Removed unused webp files: ${imports.cleaned.length}`)
  }

  return { conversion, imports }
}

export const runImageImportWorkflow = () => {
  const imports = generateImageImports()
  if (imports.unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Import workflow completed with unresolved images (${imports.unresolved.length})`,
    )
  }

  console.log(
    `${MSG.SUCCESS} Import workflow completed: imports=${imports.importCount}, changed=${imports.changed ? 'yes' : 'no'}`,
  )
  if (imports.cleaned.length > 0) {
    console.log(`${MSG.SUCCESS} Removed unused webp files: ${imports.cleaned.length}`)
  }

  return imports
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('images')) {
  runImageWorkflow().catch(err => {
    console.error(`${MSG.ERROR} ${err}`)
    process.exit(1)
  })
}
