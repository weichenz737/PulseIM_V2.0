import QRCode from 'qrcode'

/** 个人名片二维码内容（与用户端一致） */
export function userQrPayload(pulseId: string): string {
  return `pulse://user/${pulseId}`
}

/** 群聊二维码内容（与用户端一致） */
export function groupQrPayload(conversationId: string | number): string {
  return `pulse://group/${conversationId}`
}

export async function renderQrDataUrl(payload: string, size = 220): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    color: { dark: '#121317', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const name = filename.endsWith('.png') ? filename : `${filename}.png`
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
