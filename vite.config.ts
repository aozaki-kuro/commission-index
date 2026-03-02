import { assetsWorkflowPlugin } from './vite.assets-workflow'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

const adminApiPort = Number(process.env.VITE_ADMIN_API_PORT ?? 8788)

export default defineConfig({
  plugins: [assetsWorkflowPlugin(), react(), tsconfigPaths()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: id => {
          if (!id.includes('node_modules')) return
          if (id.includes('fuse.js')) return 'vendor-search'
          if (id.includes('@dnd-kit')) return 'vendor-admin'
          if (id.includes('@radix-ui') || id.includes('cmdk')) return 'vendor-ui'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${adminApiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
})
