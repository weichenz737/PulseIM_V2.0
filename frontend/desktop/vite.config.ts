import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OutputBundle, OutputOptions } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'

const require = createRequire(import.meta.url)
const sharedModules = fileURLToPath(new URL('../mobile/node_modules', import.meta.url))
const { defineConfig } = require(`${sharedModules}/vite`)
const vue = require(`${sharedModules}/@vitejs/plugin-vue`).default

function preloadLegacyDesktopChunk(): Plugin {
  let outputDir = ''
  return {
    name: 'preload-legacy-desktop-chunk',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outputDir = config.build.outDir
    },
    writeBundle(_options: OutputOptions, bundle: OutputBundle) {
      const legacyChunk = Object.values(bundle).find((item) => (
        item.type === 'chunk'
        && (
          Object.keys(item.modules).some((moduleId) => (
            moduleId.replaceAll('\\', '/').endsWith('/desktop/app.js')
          ))
          || /^assets\/app-[^/]+\.js$/.test(item.fileName)
        )
      ))
      if (!legacyChunk || !outputDir) return
      const indexPath = join(outputDir, 'index.html')
      const source = readFileSync(indexPath, 'utf8')
      if (source.includes(`./${legacyChunk.fileName}`)) return
      writeFileSync(
        indexPath,
        source.replace('</head>', `  <link rel="modulepreload" href="./${legacyChunk.fileName}" />\n  </head>`),
        'utf8',
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), preloadLegacyDesktopChunk()],
  // Relative asset URLs work for both file:// Electron windows and web
  // deployments mounted below the domain root.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      vue: `${sharedModules}/vue`,
      qrcode: `${sharedModules}/qrcode`,
      'pdfjs-dist': `${sharedModules}/pdfjs-dist`,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Electron/Chrome profiles may live under this folder during local
    // preview. Watching their locked cache files makes Vite crash on Windows
    // with EBUSY, which leaves the desktop page unable to open.
    watch: {
      ignored: ['**/.tmp-chrome-profile/**', '**/.npm-cache/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
