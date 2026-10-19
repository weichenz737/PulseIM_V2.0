const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, session, Tray } = require('electron')
const crypto = require('node:crypto')
const https = require('node:https')
const path = require('node:path')
const fs = require('node:fs/promises')

const isDev = Boolean(process.env.PULSE_DESKTOP_DEV_URL)
const devUrl = process.env.PULSE_DESKTOP_DEV_URL || ''
const trustedPulseServer = {
  protocol: 'https:',
  hostname: '39.97.240.31',
  port: 9001,
  fingerprint256: '8078F55E8F2B1861465324D498CAC50A6E58E38DAF72527215F98933D99DF9D4',
}
let mainWindow = null
let tray = null
let isQuitting = false
let nativeWindowTheme = 'light'
let quitLogoutPending = false
let quitLogoutComplete = false
let quitLogoutTimer = null
const pendingSavePaths = new Map()
let pulseMediaToken = ''

const nativeWindowThemeColors = {
  light: {
    background: '#f5f8fc',
    titleBar: '#f5f8fc',
    symbols: '#1f2937',
  },
  dark: {
    background: '#121317',
    titleBar: '#1b1d23',
    symbols: '#e7edf7',
  },
}

const pulseTraySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1" y="1" width="14" height="14" rx="4" fill="#08aeea"/>
  <path d="M5 11 7.25 5h1.5L6.5 11H5Zm3.25 0L10.5 5H12l-2.25 6h-1.5Z" fill="#fff"/>
</svg>`

function nativeImageFromSvg(svg) {
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function createPulseTrayIcon() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'pulse.ico'))
    if (!icon.isEmpty()) return icon
  } catch {
    // Fall back to the inline icon when running from a development checkout.
  }
  return nativeImageFromSvg(pulseTraySvg)
}

function createPulseBadgeIcon(count) {
  const label = count > 99 ? '99+' : String(Math.max(0, count))
  const fontSize = label.length > 2 ? 7 : 9
  return nativeImageFromSvg(`
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="7" fill="#ef4444" stroke="#fff" stroke-width="1"/>
  <text x="8" y="11" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${label}</text>
</svg>`)
}

function applyNativeWindowTheme(theme) {
  nativeWindowTheme = theme === 'dark' ? 'dark' : 'light'
  const colors = nativeWindowThemeColors[nativeWindowTheme]
  if (!mainWindow || mainWindow.isDestroyed()) return nativeWindowTheme

  mainWindow.setBackgroundColor(colors.background)
  if (process.platform === 'win32' && typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay({
      color: colors.titleBar,
      symbolColor: colors.symbols,
      height: 36,
    })
  }
  return nativeWindowTheme
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray) return
  tray = new Tray(createPulseTrayIcon())
  tray.setToolTip('Pulse')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Pulse', click: showMainWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
  tray.on('click', showMainWindow)
}

function finishQuit() {
  if (quitLogoutTimer) {
    clearTimeout(quitLogoutTimer)
    quitLogoutTimer = null
  }
  quitLogoutComplete = true
  app.quit()
}

function requestRendererLogoutBeforeQuit() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    finishQuit()
    return
  }
  quitLogoutPending = true
  mainWindow.webContents.send('pulse:quit-requested')
  // Do not leave the process stuck if the renderer is frozen or the network
  // is unavailable. The renderer clears its local token in a finally block.
  quitLogoutTimer = setTimeout(finishQuit, 2500)
}

function configurePulseApiRequests() {
  const urlFilter = [`${trustedPulseServer.protocol || 'https:'}//${trustedPulseServer.hostname}:9001/pulseim/*`]
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: urlFilter }, (details, callback) => {
    // Native media elements cannot set Authorization themselves. Attach the
    // renderer's current session token only to our protected raw-file route.
    if (pulseMediaToken && isTrustedPulseRawFileUrl(details.url)) {
      details.requestHeaders.Authorization = `Bearer ${pulseMediaToken}`
    }
    // A file:// renderer sends Origin: null. The API intentionally allows
    // only its web origins, so remove this meaningless local-shell header
    // for the pinned Pulse server before the request reaches Spring Security.
    Object.keys(details.requestHeaders).forEach((key) => {
      if (key.toLowerCase() === 'origin' && details.requestHeaders[key] === 'null') delete details.requestHeaders[key]
    })
    callback({ requestHeaders: details.requestHeaders })
  })
}

function isTrustedPulseRawFileUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    return parsed.protocol === trustedPulseServer.protocol
      && parsed.hostname === trustedPulseServer.hostname
      && Number(parsed.port || 443) === trustedPulseServer.port
      && /\/api\/v1\/files\/raw\//i.test(parsed.pathname)
  } catch {
    return false
  }
}

function isTrustedPulseCertificate(url, certificate) {
  try {
    const parsed = new URL(url)
    const fingerprint = String(certificate?.fingerprint256 || '').replaceAll(':', '').toUpperCase()
    return parsed.protocol === 'https:'
      && parsed.hostname === trustedPulseServer.hostname
      && fingerprint === trustedPulseServer.fingerprint256
  } catch {
    return false
  }
}

function requestPulseApi(payload = {}) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(String(payload.url || ''))
    } catch {
      reject(new Error('Pulse API 地址无效'))
      return
    }

    if (parsed.protocol !== trustedPulseServer.protocol
      || parsed.hostname !== trustedPulseServer.hostname
      || Number(parsed.port || 443) !== trustedPulseServer.port
      || !parsed.pathname.startsWith('/pulseim/api/')) {
      reject(new Error('Pulse API 地址未被允许'))
      return
    }

    const headers = {}
    Object.entries(payload.headers || {}).forEach(([key, value]) => {
      if (value != null) headers[key] = String(value)
    })
    Object.keys(headers).forEach((key) => {
      if (['origin', 'referer', 'host', 'content-length'].includes(key.toLowerCase())) delete headers[key]
    })

    const body = typeof payload.body === 'string' ? payload.body : ''
    if (body) headers['Content-Length'] = Buffer.byteLength(body)

    const request = https.request({
      protocol: trustedPulseServer.protocol,
      hostname: trustedPulseServer.hostname,
      port: trustedPulseServer.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: String(payload.method || (body ? 'POST' : 'GET')).toUpperCase(),
      headers,
      rejectUnauthorized: false,
    }, (response) => {
      const chunks = []
      let size = 0
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        size += Buffer.byteLength(chunk)
        if (size <= 16 * 1024 * 1024) chunks.push(chunk)
      })
      response.on('end', () => {
        if (size > 16 * 1024 * 1024) {
          reject(new Error('Pulse API 响应过大'))
          return
        }
        const responseHeaders = {}
        Object.entries(response.headers).forEach(([key, value]) => {
          if (typeof value === 'string') responseHeaders[key] = value
        })
        resolve({
          status: response.statusCode || 502,
          headers: responseHeaders,
          body: chunks.join(''),
        })
      })
    })

    request.setTimeout(30000, () => request.destroy(new Error('连接 Pulse 服务超时')))
    request.on('socket', (socket) => {
      socket.once('secureConnect', () => {
        const peer = socket.getPeerCertificate(true)
        const fingerprint = peer?.raw
          ? crypto.createHash('sha256').update(peer.raw).digest('hex').toUpperCase()
          : ''
        if (fingerprint !== trustedPulseServer.fingerprint256) {
          request.destroy(new Error('Pulse 服务器证书校验失败'))
        }
      })
    })
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

function savePathsForSender(senderId) {
  let paths = pendingSavePaths.get(senderId)
  if (!paths) {
    paths = new Set()
    pendingSavePaths.set(senderId, paths)
  }
  return paths
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1020,
    minHeight: 720,
    backgroundColor: '#f5f8fc',
    title: 'Pulse',
    show: false,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: nativeWindowThemeColors.light.titleBar,
            symbolColor: nativeWindowThemeColors.light.symbols,
            height: 36,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The packaged renderer is local file:// content while the API is
      // served from the configured HTTPS origin. The server intentionally
      // does not allow the browser's null/file origin, so keep this relaxed
      // only for the trusted local desktop shell.
      webSecurity: false,
    },
  })
  applyNativeWindowTheme(nativeWindowTheme)

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => { mainWindow = null })

  if (isDev) {
    await mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // The current 9001 deployment uses a self-signed certificate. Keep the
  // exception narrowly pinned to that server and its current certificate so
  // other HTTPS connections remain subject to normal certificate checks.
  app.on('certificate-error', (event, _webContents, url, _error, certificate, callback) => {
    if (isTrustedPulseCertificate(url, certificate)) {
      event.preventDefault()
      callback(true)
      return
    }
    callback(false)
  })

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.pulseim.desktop')
    Menu.setApplicationMenu(null)
    createTray()
    configurePulseApiRequests()

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      // Camera and microphone permission will be replaced by an explicit
      // in-app permission flow before voice/video calls are connected.
      callback(['media', 'geolocation'].includes(permission))
    })

    await createWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitLogoutComplete) return
    event.preventDefault()
    if (quitLogoutPending) return
    isQuitting = true
    requestRendererLogoutBeforeQuit()
  })
}

ipcMain.on('pulse:quit-ready', (event) => {
  if (!quitLogoutPending || !mainWindow || event.sender !== mainWindow.webContents) return
  quitLogoutPending = false
  finishQuit()
})

ipcMain.handle('pulse:show-error', async (_event, message) => {
  await dialog.showMessageBox({
    type: 'error',
    title: 'Pulse',
    message: String(message || '发生未知错误'),
  })
})

ipcMain.handle('pulse:api-request', (_event, payload) => requestPulseApi(payload))

ipcMain.on('pulse:set-media-token', (_event, token) => {
  pulseMediaToken = String(token || '').trim()
})

ipcMain.handle('pulse:set-theme', (_event, theme) => ({
  ok: true,
  theme: applyNativeWindowTheme(theme),
}))

ipcMain.handle('pulse:show-notification', async (_event, payload = {}) => {
  if (!Notification.isSupported()) return { ok: false }
  const notification = new Notification({
    title: String(payload.title || 'Pulse'),
    body: String(payload.body || '你有一条新消息'),
    silent: Boolean(payload.silent),
  })
  notification.on('click', showMainWindow)
  notification.show()
  return { ok: true }
})

ipcMain.handle('pulse:set-badge', async (_event, value) => {
  const count = Math.max(0, Math.min(999, Number(value) || 0))
  if (process.platform !== 'win32' && typeof app.setBadgeCount === 'function') app.setBadgeCount(count)
  if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
    mainWindow.setOverlayIcon(count > 0 ? createPulseBadgeIcon(count) : null, count > 0 ? `${count} 条未读消息` : '')
  }
  if (tray) tray.setToolTip(count > 0 ? `Pulse（${count} 条未读）` : 'Pulse')
  return { ok: true, count }
})

ipcMain.handle('pulse:choose-save-path', async (event, payload = {}) => {
  const filename = String(payload.filename || 'Pulse媒体').trim() || 'Pulse媒体'
  const extension = path.extname(filename).replace(/^\./, '').toLowerCase()
  const result = await dialog.showSaveDialog(
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    {
      title: '另存为',
      defaultPath: filename,
      filters: [{ name: '媒体文件', extensions: [extension || '*'] }],
    },
  )
  if (result.canceled || !result.filePath) return { canceled: true }
  savePathsForSender(event.sender.id).add(result.filePath)
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('pulse:download-file-to-path', async (event, payload = {}) => {
  const filePath = String(payload.filePath || '')
  const paths = pendingSavePaths.get(event.sender.id)
  if (!filePath || !paths?.has(filePath)) {
    return { ok: false, error: '保存路径无效，请重新选择保存位置' }
  }
  paths.delete(filePath)

  try {
    const url = String(payload.url || '').trim()
    if (!url) throw new Error('媒体地址为空')
    const headers = {}
    const authorization = String(payload.authorization || '').trim()
    if (authorization) headers.Authorization = authorization
    const response = await fetch(url, { headers })
    if (!response.ok) throw new Error(`下载失败（${response.status}）`)
    await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()))
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '下载失败' }
  }
})
