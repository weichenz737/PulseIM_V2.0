import { reactive } from 'vue'

export type MediaActionKind = 'image' | 'video'

export interface MediaActionPayload {
  /** 已解析的媒体地址（绝对或相对均可） */
  url: string
  kind: MediaActionKind
  /** 建议文件名，保存/转发时使用 */
  filename?: string
  contentType?: string
  /** 原图地址（转发图片时保留） */
  originalUrl?: string
  /** 新架构文件引用；转发时只传此 ID，不复制文件内容。 */
  fileId?: string
}

/** 朋友圈等场景长按媒体后的操作弹层状态 */
export const mediaActionState = reactive({
  visible: false,
  url: '',
  kind: 'image' as MediaActionKind,
  filename: '',
  contentType: '',
  originalUrl: '',
  fileId: '',
})

export function openMediaActions(payload: MediaActionPayload) {
  mediaActionState.visible = true
  mediaActionState.url = payload.url || ''
  mediaActionState.kind = payload.kind === 'video' ? 'video' : 'image'
  mediaActionState.filename = payload.filename || ''
  mediaActionState.contentType = payload.contentType || ''
  mediaActionState.originalUrl = payload.originalUrl || ''
  mediaActionState.fileId = payload.fileId || ''
}

export function closeMediaActions() {
  mediaActionState.visible = false
}
