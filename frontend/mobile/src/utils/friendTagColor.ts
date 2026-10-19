/** 按好友身份稳定取色，不同默认好友标签背景区分开 */
const PALETTE = [
  { bg: 'rgba(69, 121, 255, 0.18)', color: '#8fb0ff' },
  { bg: 'rgba(16, 185, 129, 0.18)', color: '#6ee7b7' },
  { bg: 'rgba(245, 158, 11, 0.20)', color: '#fbbf24' },
  { bg: 'rgba(239, 68, 68, 0.18)', color: '#fca5a5' },
  { bg: 'rgba(168, 85, 247, 0.18)', color: '#d8b4fe' },
  { bg: 'rgba(6, 182, 212, 0.18)', color: '#67e8f9' },
  { bg: 'rgba(236, 72, 153, 0.18)', color: '#f9a8d4' },
  { bg: 'rgba(132, 204, 22, 0.18)', color: '#bef264' },
] as const

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function friendTagStyle(
  seed?: string | number | null,
): { background: string; color: string } | undefined {
  if (seed == null || seed === '') return undefined
  const tone = PALETTE[hashSeed(String(seed)) % PALETTE.length]
  return { background: tone.bg, color: tone.color }
}
