import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    resolve: {
      alias: {
        '@mickyballadelli/matrix': '/Users/micky/dev/Echo-Project/Matrix/src'
      },
      dedupe: ['@mickyballadelli/matrix']
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: '@mickyballadelli/matrix'
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' }
        },
        '/socket.io': {
          target: env.VITE_SOCKET_URL || 'http://localhost:3000',
          ws: true,
          changeOrigin: true,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' }
        }
      }
    },
    build: {
      sourcemap: mode !== 'production'
    }
  }
})
