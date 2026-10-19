import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface DownloadProgress {
  downloadId: number
  downloadedBytes: number
  totalBytes: number
  remainingBytes: number
  percent: number
  speedBytesPerSecond: number
  status:
    | 'pending'
    | 'running'
    | 'paused'
    | 'completed'
    | 'permission_required'
    | 'installing'
    | 'install_failed'
    | 'failed'
  reason?: number
  message?: string
}

interface PulseUpdaterPlugin {
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{ downloadId: number; reused?: boolean }>
  cancelDownload(): Promise<void>
  getDownloadState(): Promise<DownloadProgress>
  openInstaller(): Promise<void>
  addListener(
    eventName: 'downloadProgress',
    listener: (progress: DownloadProgress) => void,
  ): Promise<PluginListenerHandle>
}

const PulseUpdater = registerPlugin<PulseUpdaterPlugin>('PulseUpdater')

export const downloadAndInstall = (url: string, fileName?: string) =>
  PulseUpdater.downloadAndInstall({ url, fileName })

export const cancelDownload = () => PulseUpdater.cancelDownload()

export const onDownloadProgress = (listener: (progress: DownloadProgress) => void) =>
  PulseUpdater.addListener('downloadProgress', listener)

export const getDownloadState = () => PulseUpdater.getDownloadState()

export const openInstaller = () => PulseUpdater.openInstaller()
