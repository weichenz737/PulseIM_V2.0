const path = require('node:path')

module.exports = {
  outDir: process.env.PULSE_ELECTRON_OUT_DIR || 'out',
  packagerConfig: {
    asar: true,
    name: 'Pulse',
    executableName: 'Pulse',
    icon: path.join(__dirname, 'electron', 'pulse'),
    // 运行时只需要 dist/ 与 electron/；node_modules 已被 Vite 打进 dist，
    // 排除后 app.asar 只包含网页产物，避免把整套构建依赖打进安装包
    ignore: [
      // electron-packager passes relative paths without a leading slash on
      // Windows. Keep build dependencies out of app.asar; otherwise a local
      // install of Electron Forge inflates the package and Squirrel can fail
      // while streaming the asar into the installer.
      /(^|[\\/])node_modules($|[\\/])/, 
      /(^|[\\/])\.npm-cache($|[\\/])/, 
      /^[/\\]out(?:[-_].*)?(?:[/\\]|$)/i,
      /^\/\.git($|\/)/,
      /^\/desktop-vite\.(err|out)\.log$/,
      /^\/forge\.config\.cjs$/,
      /^\/index\.html$/,
      /^\/app\.js$/,
      /^\/styles\.css$/,
      /^\/main\.cjs$/,
      /^\/preload\.cjs$/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'PulseIM Team',
        description: 'PulseIM 桌面客户端',
      },
    },
    { name: '@electron-forge/maker-dmg' },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
}
