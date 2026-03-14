import { readFile, writeFile } from 'node:fs/promises'

export async function writeFileIfChanged(targetPath: string, nextContent: string) {
  try {
    const currentContent = await readFile(targetPath, 'utf8')
    if (currentContent === nextContent) {
      return 'unchanged' as const
    }
  }
  catch {
    // Write the target file when it does not exist or is unreadable.
  }

  await writeFile(targetPath, nextContent)
  return 'written' as const
}
