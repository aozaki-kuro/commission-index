import type { AstroIntegration, ViteUserConfig } from 'astro'
import path from 'node:path'
import process from 'node:process'
import {
  collectHiddenCommissionIds,
  getGeneratedFactSourceContent,
  getGeneratedSourceImageManifest,
} from '../data/generatedFactSource'

const GENERATED_SOURCE_IMAGE_PATH_PATTERN = /(?:^|\/)generated\/source-images\/.+\.(?:jpe?g|png)$/
const GENERATED_FACT_SOURCE_PATH_PATTERN = /(?:^|\/)generated\/fact-source\/.+\.json$/

function isSourceImagePath(filePath: string) {
  const normalized = filePath.split(path.sep).join('/').toLowerCase()
  return (
    GENERATED_SOURCE_IMAGE_PATH_PATTERN.test(normalized)
    || GENERATED_FACT_SOURCE_PATH_PATTERN.test(normalized)
  )
}

// `vite` is not a direct dependency of this workspace; derive the plugin type from Astro's config type.
type VitePlugin = Extract<NonNullable<ViteUserConfig['plugins']>[number], { name: string }>

const HIDDEN_SOURCE_IMAGE_STUB_ID = '\0hidden-source-image'

/**
 * Astro's `astro:assets:esm` load hook emits every image that enters the module graph, and only images that
 * later pass through `getImage` get their original deleted. The registry's eager glob imports every generated
 * file, so originals of hidden commissions (never rendered, never `getImage`d) would ship. Resolving their
 * imports to an empty stub keeps them out of the graph at the source.
 */
function hiddenSourceImagePlugin(): VitePlugin {
  // No local cache: the data module caches in build and re-reads in dev, so its path resolution and
  // freshness rules stay the single source of truth.
  function readHiddenSuffixes() {
    const hiddenIds = collectHiddenCommissionIds(getGeneratedFactSourceContent())
    const hiddenFiles = getGeneratedSourceImageManifest().files.filter(file => hiddenIds.has(file.commissionId))
    return hiddenFiles.map(file => `/generated/${file.relativePath}`.toLowerCase())
  }

  return {
    name: 'hidden-source-image-stub',
    enforce: 'pre',
    resolveId(source) {
      const normalized = source.split(path.sep).join('/').toLowerCase()
      if (!GENERATED_SOURCE_IMAGE_PATH_PATTERN.test(normalized)) {
        return null
      }
      return readHiddenSuffixes().some(suffix => normalized.endsWith(suffix))
        ? HIDDEN_SOURCE_IMAGE_STUB_ID
        : null
    },
    load(id) {
      return id === HIDDEN_SOURCE_IMAGE_STUB_ID ? 'export default undefined' : null
    },
  }
}

export function assetsPipelineIntegration(): AstroIntegration {
  return {
    name: 'assets-pipeline',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [hiddenSourceImagePlugin()] } })
      },
      'astro:server:setup': async ({ server, logger }) => {
        const triggerReload = (filePath: string) => {
          if (!isSourceImagePath(filePath))
            return

          const relativePath = path.relative(process.cwd(), filePath)
          logger.info(`[assets/dev-watch] generated fact source changed: ${relativePath}`)
          logger.info('[assets/dev-watch] trigger full reload')
          // Drop cached resolveId results so a Hidden flip re-runs the stub decision on the next load.
          server.moduleGraph.invalidateAll()
          server.ws.send({ type: 'full-reload' })
        }

        server.watcher.on('add', triggerReload)
        server.watcher.on('change', triggerReload)
        server.watcher.on('unlink', triggerReload)
      },
    },
  }
}
