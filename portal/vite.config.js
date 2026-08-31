import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    resolve: {
      dedupe: ['@mickyballadelli/matrix']
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: '@mickyballadelli/matrix'
    },
    server: {
      port: 5000,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: env.VITE_SOCKET_URL || 'http://localhost:3000',
          ws: true,
          changeOrigin: true
        }
      }
    },
    build: {
      sourcemap: mode !== 'production'
    }
  }
})
