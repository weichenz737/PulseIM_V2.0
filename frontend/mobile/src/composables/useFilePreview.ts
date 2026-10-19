import { reactive } from 'vue'
import { fileDownloadUrl } from '@/api/file'

export interface FilePreviewPayload {
  /** 已解析的媒体地址 */
  url: string
  name: string
  size?: number
  contentType?: string
  fileId?: string
  /** 预览层右上角“转发”按钮的动作；没有该动作时不显示按钮。 */
  onForward?: () => void
}

/** 聊天文件消息的应用内预览状态 */
export const filePreviewState = reactive({
  visible: false,
  url: '',
  name: '',
  size: 0,
  contentType: '',
  fileId: '',
  onForward: null as (() => void) | null,
})

export function openFilePreview(payload: FilePreviewPayload) {
  const fileId = payload.fileId || ''
  filePreviewState.visible = true
  filePreviewState.url = payload.url || (fileId ? fileDownloadUrl(fileId) : '')
  filePreviewState.name = payload.name || '文件'
  filePreviewState.size = Number(payload.size || 0)
  filePreviewState.contentType = payload.contentType || ''
  filePreviewState.fileId = fileId
  filePreviewState.onForward = payload.onForward || null
}

export function closeFilePreview() {
  filePreviewState.visible = false
  filePreviewState.onForward = null
}
