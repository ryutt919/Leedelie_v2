import type { Ingredient } from '../domain/types'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'

type Store = {
  items: Ingredient[]
}

const EMPTY: Store = { items: [] }

export function loadIngredients(): Ingredient[] {
  const r = readJson<Store>(LS_KEYS.ingredients)
  if (!r.ok) return EMPTY.items
  return Array.isArray(r.value.items) ? r.value.items : EMPTY.items
}

export function saveIngredients(items: Ingredient[]) {
  writeJson<Store>(LS_KEYS.ingredients, { items })
}

export function upsertIngredient(next: Ingredient) {
  const items = loadIngredients()
  const idx = items.findIndex((x) => x.id === next.id)
  if (idx >= 0) items[idx] = next
  else items.unshift(next)
  saveIngredients(items)
}

export function deleteIngredient(id: string) {
  saveIngredients(loadIngredients().filter((x) => x.id !== id))
}


