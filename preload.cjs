const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pulseDesktop', {
  platform: process.platform,
  apiRequest: (options) => ipcRenderer.invoke('pulse:api-request', options),
  setMediaToken: (token) => ipcRenderer.send('pulse:set-media-token', token),
  setTheme: (theme) => ipcRenderer.invoke('pulse:set-theme', theme),
  showError: (message) => ipcRenderer.invoke('pulse:show-error', message),
  showNotification: (options) => ipcRenderer.invoke('pulse:show-notification', options),
  setBadge: (count) => ipcRenderer.invoke('pulse:set-badge', count),
  chooseSavePath: (options) => ipcRenderer.invoke('pulse:choose-save-path', options),
  downloadFileToPath: (options) => ipcRenderer.invoke('pulse:download-file-to-path', options),
  onQuitRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('pulse:quit-requested', listener)
    return () => ipcRenderer.removeListener('pulse:quit-requested', listener)
  },
  notifyQuitReady: () => ipcRenderer.send('pulse:quit-ready'),
})
