'use server'

import path from 'node:path'

import { runImageWorkflow } from '#scripts/images'

// Runs image conversion + import regeneration in development.
export const runImagePipeline = async () => {
  try {
    // Ensure the public/images directory exists before processing
    const cwd = process.cwd()
    const imagesDir = path.join(cwd, 'public', 'images')
    const webpDir = path.join(imagesDir, 'webp')
    await runImageWorkflow()
    console.log('[image-pipeline] updated images in', webpDir)
  } catch (error) {
    console.error('[image-pipeline] failed:', error)
  }
}
