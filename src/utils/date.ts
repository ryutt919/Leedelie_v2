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

export function daysInRangeISO(startDateISO: string, endDateISO: string) {
  const start = dayjs(startDateISO, 'YYYY-MM-DD', true)
  const end = dayjs(endDateISO, 'YYYY-MM-DD', true)
  if (!start.isValid() || !end.isValid()) return []
  if (end.isBefore(start, 'day')) return []
  const days = end.diff(start, 'day')
  const out: string[] = []
  for (let i = 0; i <= days; i++) {
    out.push(start.add(i, 'day').format('YYYY-MM-DD'))
  }
  return out
}

export function isISODate(s: string) {
  return dayjs(s, 'YYYY-MM-DD', true).isValid()
}



