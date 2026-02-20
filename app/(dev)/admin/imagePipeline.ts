'use server'

import path from 'node:path'

import { runImageImportWorkflow, runImageWorkflow } from '#scripts/images'

// Runs image conversion + import regeneration in development.
export const runImagePipeline = async () => {
  try {
    // Ensure source/output image directories exist before processing
    const cwd = process.cwd()
    const imagesDir = path.join(cwd, 'data', 'images')
    await runImageWorkflow()
    console.log('[image-pipeline] source images in', imagesDir)
    console.log('[image-pipeline] updated images in', path.join(cwd, 'public', 'images', 'webp'))
  } catch (error) {
    console.error('[image-pipeline] failed:', error)
  }
}

export const runImageImportPipeline = async () => {
  try {
    const cwd = process.cwd()
    const imageImportsFile = path.join(cwd, 'data', 'imageImports.ts')
    runImageImportWorkflow()
    console.log('[image-pipeline] updated import map in', imageImportsFile)
  } catch (error) {
    console.error('[image-pipeline] failed:', error)
  }
}
