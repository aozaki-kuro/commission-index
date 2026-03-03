import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const DEFAULT_INDEX_HTML_GZIP_LIMIT = 22 * 1024
const DEFAULT_INITIAL_JS_GZIP_LIMIT = 112 * 1024
const DEFAULT_BUILD_MEDIAN_SEC_LIMIT = 2.8
const DEFAULT_BUILD_RUNS = 3

const cwd = process.cwd()
const distDir = path.join(cwd, 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    runs: DEFAULT_BUILD_RUNS,
    skipBuild: false,
    indexHtmlGzipLimit: DEFAULT_INDEX_HTML_GZIP_LIMIT,
    initialJsGzipLimit: DEFAULT_INITIAL_JS_GZIP_LIMIT,
    buildMedianSecLimit: DEFAULT_BUILD_MEDIAN_SEC_LIMIT,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--skip-build') {
      options.skipBuild = true
      continue
    }

    if (arg === '--runs') {
      options.runs = Number(args[i + 1] ?? DEFAULT_BUILD_RUNS)
      i += 1
      continue
    }

    if (arg === '--index-html-gzip-limit') {
      options.indexHtmlGzipLimit = Number(args[i + 1] ?? DEFAULT_INDEX_HTML_GZIP_LIMIT)
      i += 1
      continue
    }

    if (arg === '--initial-js-gzip-limit') {
      options.initialJsGzipLimit = Number(args[i + 1] ?? DEFAULT_INITIAL_JS_GZIP_LIMIT)
      i += 1
      continue
    }

    if (arg === '--build-median-sec-limit') {
      options.buildMedianSecLimit = Number(args[i + 1] ?? DEFAULT_BUILD_MEDIAN_SEC_LIMIT)
      i += 1
      continue
    }

    throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

const walk = (dir: string): string[] => {
  const out: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }

  return out
}

const uniq = <T>(input: T[]) => [...new Set(input)]

const pick = (regex: RegExp, content: string): string[] => {
  const out: string[] = []
  let match: RegExpExecArray | null = null

  while ((match = regex.exec(content)) !== null) {
    out.push(match[1])
  }

  return out
}

const cleanHref = (value: string) => value.split('?')[0].split('#')[0]

const resolveFromDist = (href: string) => path.join(distDir, cleanHref(href).replace(/^\//, ''))

const fileGzipSize = (filePath: string) => gzipSync(readFileSync(filePath), { level: 9 }).length

const parseStaticImports = (filePath: string, content: string): string[] => {
  const imports: string[] = []
  const patterns = [
    /(?:^|\n|;)\s*import\s+[^'"\n]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n|;)\s*export\s+[^'"\n]*?from\s*['"]([^'"]+)['"]/g,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1])
    }
  }

  return uniq(imports)
    .filter(spec => spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/'))
    .map(spec => {
      if (spec.startsWith('/')) return path.join(distDir, spec.replace(/^\//, ''))
      return path.resolve(path.dirname(filePath), spec)
    })
    .filter(dep => dep.endsWith('.js') && existsSync(dep))
}

const collectStaticClosure = (roots: string[]): string[] => {
  const visited = new Set<string>()
  const stack = [...roots]

  while (stack.length > 0) {
    const filePath = stack.pop()
    if (!filePath || visited.has(filePath)) continue

    visited.add(filePath)
    const content = readFileSync(filePath, 'utf8')
    const deps = parseStaticImports(filePath, content)

    for (const dep of deps) {
      if (!visited.has(dep)) stack.push(dep)
    }
  }

  return [...visited]
}

const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  if (sorted.length % 2 === 1) return sorted[Math.floor(sorted.length / 2)]

  const right = sorted.length / 2
  return (sorted[right - 1] + sorted[right]) / 2
}

const runBuildBench = async (runs: number) => {
  const times: number[] = []

  for (let i = 0; i < runs; i += 1) {
    const startedAt = performance.now()
    const proc = Bun.spawn(['bun', 'run', 'build'], {
      cwd,
      stdio: ['inherit', 'inherit', 'inherit'],
      env: process.env,
    })
    const code = await proc.exited
    const elapsedSec = (performance.now() - startedAt) / 1000

    if (code !== 0) {
      throw new Error(`build failed on run ${i + 1} with exit code ${code}`)
    }

    times.push(elapsedSec)
  }

  return times
}

const run = async () => {
  const options = parseArgs()

  if (!options.skipBuild) {
    console.log(`[perf] measuring build time: ${options.runs} runs`)
    const buildTimes = await runBuildBench(options.runs)
    const buildMedian = median(buildTimes)
    console.log(`[perf] build times: ${buildTimes.map(t => t.toFixed(2)).join(', ')} sec`)
    console.log(`[perf] build median: ${buildMedian.toFixed(2)} sec`)

    if (buildMedian > options.buildMedianSecLimit) {
      throw new Error(
        `build median ${buildMedian.toFixed(2)}s exceeds limit ${options.buildMedianSecLimit.toFixed(2)}s`,
      )
    }
  }

  if (!existsSync(indexHtmlPath)) {
    throw new Error('dist/index.html not found. Run bun run build first.')
  }

  const indexHtml = readFileSync(indexHtmlPath, 'utf8')
  const indexHtmlGzip = fileGzipSize(indexHtmlPath)

  const jsRefs = uniq([
    ...pick(/<script[^>]+src="([^"]+\.js[^"]*)"[^>]*>/g, indexHtml),
    ...pick(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js[^"]*)"[^>]*>/g, indexHtml),
    ...pick(/(?:component-url|renderer-url|before-hydration-url)="([^"]+\.js[^"]*)"/g, indexHtml),
  ])
  const jsEntryFiles = jsRefs.map(resolveFromDist).filter(existsSync)
  const jsClosureFiles = collectStaticClosure(jsEntryFiles)
  const initialJsGzip = jsClosureFiles.reduce(
    (total, filePath) => total + fileGzipSize(filePath),
    0,
  )

  console.log(`[perf] index.html gzip: ${indexHtmlGzip} bytes`)
  console.log(`[perf] initial JS closure gzip: ${initialJsGzip} bytes`)

  if (indexHtmlGzip > options.indexHtmlGzipLimit) {
    throw new Error(
      `index.html gzip ${indexHtmlGzip} exceeds limit ${options.indexHtmlGzipLimit} bytes`,
    )
  }

  if (initialJsGzip > options.initialJsGzipLimit) {
    throw new Error(
      `initial JS closure gzip ${initialJsGzip} exceeds limit ${options.initialJsGzipLimit} bytes`,
    )
  }

  const allDistFiles = walk(distDir)
  const totalDistRaw = allDistFiles.reduce((total, filePath) => total + statSync(filePath).size, 0)
  console.log(`[perf] dist raw total: ${totalDistRaw} bytes`)
  console.log('[perf] check passed')
}

await run().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[perf] ${message}`)
  process.exit(1)
})
