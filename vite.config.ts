import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

const adminApiPort = Number(process.env.VITE_ADMIN_API_PORT ?? 8788)

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
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
