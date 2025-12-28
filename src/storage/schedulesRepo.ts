import type { SavedSchedule } from '../domain/types'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'

type Store = {
  items: SavedSchedule[]
}

const EMPTY: Store = { items: [] }

export function loadSchedules(): SavedSchedule[] {
  const r = readJson<Store>(LS_KEYS.schedules)
  if (!r.ok) return EMPTY.items
  return Array.isArray(r.value.items) ? r.value.items : EMPTY.items
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


