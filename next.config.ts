import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

// 获取当前项目的根目录路径
const projectDir = path.dirname(fileURLToPath(import.meta.url))

// 把绝对路径改成项目内的相对路径（以 ./ 开头，统一为 POSIX 斜杠）
const rel = (p: string) => {
  const r = path.posix.join('.', path.relative(projectDir, p).split(path.sep).join(path.posix.sep))
  return r.startsWith('.') ? r : `./${r}`
}

// 获取 admin actions 文件的路径
const getAdminActionsPath = (isDev: boolean) =>
  rel(path.join(projectDir, 'app/(dev)/admin', isDev ? 'actions.dev.ts' : 'actions.stub.ts'))

// Next.js 配置
const nextConfig = (phase: string): NextConfig => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  const adminActionsPath = getAdminActionsPath(isDev)

  return {
    reactStrictMode: true,
    cleanDistDir: true,
    images: { unoptimized: true, minimumCacheTTL: 604800 },
    output: 'export',
    experimental: isDev
      ? {
          serverActions: {
            bodySizeLimit: '8mb',
          },
        }
      : undefined,

    turbopack: {
      resolveAlias: {
        '#admin/actions': adminActionsPath,
      },
    },
  }
}

export default nextConfig
