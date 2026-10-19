const BEIJING_TIME_ZONE = 'Asia/Shanghai'

const beijingDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const beijingDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BEIJING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 北京时间当天 YYYY-MM-DD */
export function todayYmd(date: Date = new Date()) {
  return beijingDateFormatter.format(date)
}

export function formatTime(value?: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const parts = Object.fromEntries(
    beijingDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}
