/**
 * 联系人展示名 → 拼音首字母（A–Z / #）
 * 中文用 zh-CN Collator 与分界字比较，无需额外拼音库。
 */
const ZH_LETTER_BOUNDS: Array<[string, string]> = [
  ['A', '阿'],
  ['B', '八'],
  ['C', '嚓'],
  ['D', '哒'],
  ['E', '妸'],
  ['F', '发'],
  ['G', '旮'],
  ['H', '哈'],
  ['J', '讥'],
  ['K', '咔'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '趴'],
  ['Q', '七'],
  ['R', '然'],
  ['S', '仨'],
  ['T', '他'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '压'],
  ['Z', '匝'],
]

/** 少数汉字按 Unicode/笔画排序会落到错误字母，按常用拼音覆盖 */
const LETTER_OVERRIDES: Record<string, string> = {
  嗯: 'E', // ěn / èn / ńg，按 en 归 E
  唔: 'W',
  欸: 'A',
  吖: 'A',
}

const zhCollator = new Intl.Collator('zh-CN')

function chineseFirstLetter(ch: string): string {
  const override = LETTER_OVERRIDES[ch]
  if (override) return override
  // 比「阿」还靠前的汉字归 A
  if (zhCollator.compare(ch, '阿') < 0) return 'A'
  let letter = 'Z'
  for (let i = ZH_LETTER_BOUNDS.length - 1; i >= 0; i--) {
    const [L, bound] = ZH_LETTER_BOUNDS[i]
    if (zhCollator.compare(ch, bound) >= 0) {
      letter = L
      break
    }
  }
  return letter
}

/** 取首字母：英文/拼音字母 → A-Z；汉字 → 拼音首字母；其它 → # */
export function nameFirstLetter(name: string): string {
  const s = (name || '').trim()
  if (!s) return '#'
  const ch = s.charAt(0)
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase()
  if (/[\u4e00-\u9fff]/.test(ch)) return chineseFirstLetter(ch)
  return '#'
}

/** A-Z 在前，# 在最后 */
export function compareLetters(a: string, b: string): number {
  if (a === b) return 0
  if (a === '#') return 1
  if (b === '#') return -1
  return a.localeCompare(b, 'en')
}

export function compareNamesZh(a: string, b: string): number {
  return zhCollator.compare(a || '', b || '')
}
