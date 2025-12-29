import type { SavedSchedule } from '../domain/types'
import dayjs from 'dayjs'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'
import { daysInMonthISO } from '../utils/date'

type Store = {
  items: SavedSchedule[]
}

const EMPTY: Store = { items: [] }

export function loadSchedules(): SavedSchedule[] {
  const r = readJson<Store>(LS_KEYS.schedules)
  if (!r.ok) return EMPTY.items
  const items = Array.isArray(r.value.items) ? r.value.items : EMPTY.items
  // 하위 호환: 구버전(연/월만 저장) → start/end 기간으로 마이그레이션
  return items.map((s) => {
    const any = s as unknown as Partial<SavedSchedule> & { year?: number; month?: number }
    if (any.startDateISO && any.endDateISO) return s
    const year = typeof any.year === 'number' ? any.year : dayjs().year()
    const month = typeof any.month === 'number' ? any.month : dayjs().month() + 1
    const startDateISO = `${year}-${String(month).padStart(2, '0')}-01`
    const endDateISO = daysInMonthISO(year, month).at(-1) ?? dayjs(startDateISO).endOf('month').format('YYYY-MM-DD')
    return { ...(s as any), startDateISO, endDateISO, year, month } as SavedSchedule
  })
}

export function saveSchedules(items: SavedSchedule[]) {
  writeJson<Store>(LS_KEYS.schedules, { items })
}

export function upsertSchedule(next: SavedSchedule) {
  const items = loadSchedules()
  const idx = items.findIndex((x) => x.id === next.id)
  if (idx >= 0) items[idx] = next
  else items.unshift(next)
  saveSchedules(items)
}

export function deleteSchedule(id: string) {
  saveSchedules(loadSchedules().filter((x) => x.id !== id))
}

export function getSchedule(id: string) {
  return loadSchedules().find((x) => x.id === id)
}


