import type { StaffMember } from '../domain/types'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'

export type StaffPreset = {
  id: string
  name: string
  staff: StaffMember[]
  updatedAtISO: string
}

type Store = { items: StaffPreset[] }
const EMPTY: Store = { items: [] }

export function loadStaffPresets(): StaffPreset[] {
  const r = readJson<Store>(LS_KEYS.staffPresets)
  if (!r.ok) return EMPTY.items
  return Array.isArray(r.value.items) ? r.value.items : EMPTY.items
}

export function saveStaffPresets(items: StaffPreset[]) {
  writeJson<Store>(LS_KEYS.staffPresets, { items })
}

export function upsertStaffPreset(next: StaffPreset) {
  const items = loadStaffPresets()
  const idx = items.findIndex((x) => x.id === next.id)
  if (idx >= 0) items[idx] = next
  else items.unshift(next)
  saveStaffPresets(items)
}

export function deleteStaffPreset(id: string) {
  saveStaffPresets(loadStaffPresets().filter((x) => x.id !== id))
}


