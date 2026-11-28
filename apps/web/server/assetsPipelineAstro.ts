import type { AstroIntegration, ViteUserConfig } from 'astro'
import path from 'node:path'
import process from 'node:process'
import {
  collectHiddenCommissionIds,
  getGeneratedFactSourceContent,
  getGeneratedSourceImageManifest,
} from '../data/generatedFactSource'

const GENERATED_SOURCE_IMAGE_PATH_PATTERN = /(?:^|\/)(generated\/source-images\/.+\.(?:jpe?g|png))$/
const GENERATED_FACT_SOURCE_PATH_PATTERN = /(?:^|\/)generated\/fact-source\/.+\.json$/

function normalizeImageSuffix(filePath: string) {
  return filePath.split(path.sep).join('/').normalize('NFC').toLowerCase()
}

function isSourceImagePath(filePath: string) {
  const normalized = normalizeImageSuffix(filePath)
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
 * file, so originals of hidden commissions (never rendered, never `getImage`d) would ship. Resolving imports
 * outside the visible-manifest allowlist to an empty stub keeps them out of the graph at the source.
 */
function hiddenSourceImagePlugin(): { plugin: VitePlugin, invalidate: () => void } {
  let cachedVisibleSuffixes: Set<string> | null = null

  function getVisibleSuffixes() {
    if (!cachedVisibleSuffixes) {
      const hiddenIds = collectHiddenCommissionIds(getGeneratedFactSourceContent())
      const visibleFiles = getGeneratedSourceImageManifest().files.filter(file => !hiddenIds.has(file.commissionId))
      cachedVisibleSuffixes = new Set(visibleFiles.map(file => normalizeImageSuffix(`generated/${file.relativePath}`)))
    }
    return cachedVisibleSuffixes
  }

  return {
    invalidate() {
      cachedVisibleSuffixes = null
    },
    plugin: {
      name: 'hidden-source-image-stub',
      enforce: 'pre',
      resolveId(source) {
        const normalized = normalizeImageSuffix(source)
        const match = normalized.match(GENERATED_SOURCE_IMAGE_PATH_PATTERN)
        if (!match) {
          return null
        }
        return getVisibleSuffixes().has(match[1])
          ? null
          : HIDDEN_SOURCE_IMAGE_STUB_ID
      },
      load(id) {
        return id === HIDDEN_SOURCE_IMAGE_STUB_ID
          ? 'export default undefined'
          : null
      },
    },
  }
}

export function assetsPipelineIntegration(): AstroIntegration {
  const hiddenImages = hiddenSourceImagePlugin()

  return {
    name: 'assets-pipeline',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              hiddenImages.plugin,
            ],
          },
        })
      },
      'astro:server:setup': async ({ server, logger }) => {
        const triggerReload = (filePath: string) => {
          if (!isSourceImagePath(filePath))
            return

          const relativePath = path.relative(process.cwd(), filePath)
          logger.info(`[assets/dev-watch] generated fact source changed: ${relativePath}`)
          logger.info('[assets/dev-watch] trigger full reload')
          hiddenImages.invalidate()
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
