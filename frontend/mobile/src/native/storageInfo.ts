import { registerPlugin } from '@capacitor/core'

export interface DeviceStorageInfo {
  totalBytes: number
  availableBytes: number
  appUsedBytes: number
}

interface StorageInfoPlugin {
  getInfo(): Promise<DeviceStorageInfo>
}

const StorageInfo = registerPlugin<StorageInfoPlugin>('StorageInfo')

/** Reads private app storage without requesting broad filesystem permissions. */
export function getDeviceStorageInfo(): Promise<DeviceStorageInfo> {
  return StorageInfo.getInfo()
}
