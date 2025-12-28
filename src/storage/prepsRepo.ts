import type { Prep } from '../domain/types'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'

type Store = {
  items: Prep[]
}

const EMPTY: Store = { items: [] }

export function loadPreps(): Prep[] {
  const r = readJson<Store>(LS_KEYS.preps)
  if (!r.ok) return EMPTY.items
  return Array.isArray(r.value.items) ? r.value.items : EMPTY.items
}

export function savePreps(items: Prep[]) {
  writeJson<Store>(LS_KEYS.preps, { items })
}

export function upsertPrep(next: Prep) {
  const items = loadPreps()
  const idx = items.findIndex((x) => x.id === next.id)
  if (idx >= 0) items[idx] = next
  else items.unshift(next)
  savePreps(items)
}

export function deletePrep(id: string) {
  savePreps(loadPreps().filter((x) => x.id !== id))
}

export function clearPreps() {
  savePreps([])
}


