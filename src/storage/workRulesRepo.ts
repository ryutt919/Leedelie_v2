import type { WorkRules } from '../domain/types'
import { readJson, writeJson } from './jsonStore'
import { LS_KEYS } from './keys'

export const DEFAULT_WORK_RULES: WorkRules = {
  DAILY_STAFF_BASE: 2,
  DAILY_STAFF_MAX: 3,
  WORK_HOURS: 8,
  BREAK_HOURS: 1,
}

export function loadWorkRules(): WorkRules {
  const r = readJson<WorkRules>(LS_KEYS.workRules)
  if (!r.ok) return DEFAULT_WORK_RULES
  return r.value
}

export function saveWorkRules(rules: WorkRules) {
  writeJson(LS_KEYS.workRules, rules)
}


