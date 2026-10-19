import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath, URL } from 'node:url'

function enforceNativeApiBoundary(): Plugin {
  return {
    name: 'pulse-native-api-boundary',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replaceAll('\\', '/')
      if (!file.includes('/src/') || file.includes('/src/native/')) return
      if (/(?:from\s*|import\s*\()\s*['"]@capacitor\//.test(code)) {
        this.error(
          `Capacitor API 只能在 src/native/ 内调用，请通过 @/native 统一接口访问：${file}`,
        )
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Native Capacitor assets are served from the WebView origin root. Never
  // inherit the server-only /pulseim/ prefix when an Android build is made
  // after the web deployment bundle in the same shell.
  const deployPrefix = mode === 'native'
    ? ''
    : (env.VITE_DEPLOY_PREFIX || '').replace(/\/+$/, '')

  return {
  // Nginx falls back nested routes (for example /moments) to index.html.
  // Root-relative assets keep those direct browser entries from requesting
  // non-existent paths such as /moments/assets/*.js. Capacitor also serves
  // the packaged web directory from its own origin root.
  base: deployPrefix ? `${deployPrefix}/` : '/',
  plugins: [enforceNativeApiBoundary(), vue(), basicSsl()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('pinia')) return 'vue-vendor'
          if (id.includes('/vant/')) return 'vant-vendor'
          if (id.includes('/axios/')) return 'http-vendor'
          if (id.includes('/qrcode/') || id.includes('/jsqr/')) return 'qr-vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // 保证视频 Range 请求不被缓冲改写
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const range = req.headers['range']
            if (range) proxyReq.setHeader('Range', range)
          })
        },
      },
      '/ws': {
        target: 'ws://localhost:9001',
        ws: true,
      },
    },
  },
  }
})
