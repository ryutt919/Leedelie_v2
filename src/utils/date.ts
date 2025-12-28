import dayjs from 'dayjs'

export function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function daysInMonthISO(year: number, month: number) {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
  const days = start.daysInMonth()
  const out: string[] = []
  for (let d = 1; d <= days; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

export function isISODate(s: string) {
  return dayjs(s, 'YYYY-MM-DD', true).isValid()
}


