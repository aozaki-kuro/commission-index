import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(currentDir, 'HomePage.astro'), 'utf8')

describe('homePage restore shell structure', () => {
  it('keeps the main contents wrapper visible during reload restore', () => {
    expect(source).toContain('<div id="Main Contents" class="w-full max-w-2xl">')
    expect(source).not.toContain('<div id="Main Contents" data-home-scroll-restore-shell="true"')
  })

  it('places the restore shell after the desktop sidebars', () => {
    const desktopSidebarIndex = source.indexOf('<DesktopSidebarNav')
    const restoreShellIndex = source.indexOf('<div data-home-scroll-restore-shell="true">')
    const staticSectionsIndex = source.indexOf('<StaticCommissionSections')

    expect(desktopSidebarIndex).toBeGreaterThan(-1)
    expect(restoreShellIndex).toBeGreaterThan(desktopSidebarIndex)
    expect(staticSectionsIndex).toBeGreaterThan(restoreShellIndex)
  })
})
