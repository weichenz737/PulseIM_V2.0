import {
  Directory,
  Encoding,
  Filesystem,
  type DownloadFileOptions,
  type DownloadFileResult,
  type FileInfo,
  type ReadFileResult,
} from '@capacitor/filesystem'

export { Directory, Encoding }

export interface NativeFileLocation {
  path: string
  directory?: Directory
}

export function readFile(location: NativeFileLocation): Promise<ReadFileResult> {
  return Filesystem.readFile(location)
}

export async function readTextFile(location: NativeFileLocation): Promise<string> {
  const result = await Filesystem.readFile({ ...location, encoding: Encoding.UTF8 })
  return String(result.data)
}

export function writeFile(
  location: NativeFileLocation,
  data: string | Blob,
  options: { recursive?: boolean; encoding?: Encoding } = {},
) {
  return Filesystem.writeFile({
    ...location,
    data,
    recursive: options.recursive ?? true,
    encoding: options.encoding,
  })
}

export function deleteFile(location: NativeFileLocation) {
  return Filesystem.deleteFile(location)
}

export function createDirectory(location: NativeFileLocation, recursive = true) {
  return Filesystem.mkdir({ ...location, recursive })
}

export function removeDirectory(location: NativeFileLocation, recursive = false) {
  return Filesystem.rmdir({ ...location, recursive })
}

export async function listDirectory(location: NativeFileLocation): Promise<FileInfo[]> {
  return (await Filesystem.readdir(location)).files
}

export function getFileUri(location: NativeFileLocation & { directory: Directory }) {
  return Filesystem.getUri(location)
}

export function statFile(location: NativeFileLocation) {
  return Filesystem.stat(location)
}

export function downloadFile(options: DownloadFileOptions): Promise<DownloadFileResult> {
  return Filesystem.downloadFile(options)
}

export function checkFilesystemPermissions() {
  return Filesystem.checkPermissions()
}

export function requestFilesystemPermissions() {
  return Filesystem.requestPermissions()
}
