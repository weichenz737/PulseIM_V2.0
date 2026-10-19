import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const deployPrefix = (env.VITE_DEPLOY_PREFIX || '').replace(/\/+$/, '')

  return {
    base: deployPrefix ? `${deployPrefix}/admin/` : '/admin/',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'ui-vendor'
            if (id.includes('/vue/') || id.includes('vue-router') || id.includes('pinia')) return 'vue-vendor'
            if (id.includes('axios')) return 'http-vendor'
            if (id.includes('qrcode')) return 'qrcode-vendor'
            if (id.includes('echarts')) return 'chart-vendor'
            return 'vendor'
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
