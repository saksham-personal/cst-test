import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Use relative paths in the built HTML so `dist/` can be served from any
  // sub-directory (e.g. Windows file://, reverse proxies with a path prefix).
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Large exports (e.g. 170k-row XLSX) can take a minute+ to build on
        // the backend. The default http-proxy socket timeout kills the
        // response mid-stream and surfaces in the browser as "Network Error".
        // 10 min ceiling matches our axios export calls.
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
})
