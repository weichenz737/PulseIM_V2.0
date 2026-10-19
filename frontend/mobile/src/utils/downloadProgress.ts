import type { DownloadProgress } from '@/native/updater'

export function formatDownloadBytes(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0)
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function downloadProgressText(progress: DownloadProgress): string {
  if (progress.status === 'failed') return '下载失败，请检查网络后重试'
  if (progress.status === 'install_failed') return progress.message || '无法打开系统安装器，请在下载通知中点击安装'
  if (progress.status === 'permission_required') return '请允许 Pulse 安装应用，返回后将继续安装'
  if (progress.status === 'installing') return '正在打开系统安装页面…'
  if (progress.status === 'completed') return '下载完成，正在准备安装…'
  if (progress.status === 'paused') return '下载已暂停，等待网络恢复'
  const percent = progress.totalBytes > 0 ? `${progress.percent.toFixed(1)}%` : '正在下载'
  const remaining = progress.totalBytes > 0
    ? `剩余 ${formatDownloadBytes(progress.remainingBytes)}`
    : '正在获取文件大小'
  return `${percent} · ${remaining}`
}
