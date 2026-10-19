const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.join(__dirname, '..')
const electronCli = path.join(desktopRoot, 'node_modules', 'electron', 'cli.js')
if (!fs.existsSync(electronCli)) {
  console.error('Electron is not installed correctly. Run npm install in frontend/desktop first.')
  process.exit(1)
}

const command = path.join(
  desktopRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
)
let child

try {
  child = spawn(command, [path.join(__dirname, 'main.cjs')], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      PULSE_DESKTOP_DEV_URL: process.env.PULSE_DESKTOP_DEV_URL || 'http://127.0.0.1:5173',
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
} catch (error) {
  console.error('Unable to start Electron. Run npm install in frontend/desktop first.')
  console.error(error.message)
  process.exit(1)
}

child.on('error', (error) => {
  console.error('Unable to start Electron. Run npm install in frontend/desktop first.')
  console.error(error.message)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exitCode = code ?? 1
  }
})
