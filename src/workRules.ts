import { DEFAULT_WORK_RULES, WORK_RULES_STORAGE_KEY } from './constants';
import type { WorkRules } from './constants';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getWorkRules(): WorkRules {
  if (!isBrowser()) return DEFAULT_WORK_RULES;

  try {
    const raw = localStorage.getItem(WORK_RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_WORK_RULES;

    const parsed = JSON.parse(raw) as Partial<WorkRules>;

    // Backward-compat: 기존 저장 키(DAILY_STAFF)만 있는 경우 base/max에 동일하게 반영
    const legacyDaily = (parsed as Partial<WorkRules> & { DAILY_STAFF?: unknown }).DAILY_STAFF;

    const base =
      typeof parsed.DAILY_STAFF_BASE === 'number'
        ? parsed.DAILY_STAFF_BASE
        : typeof legacyDaily === 'number'
          ? legacyDaily
          : DEFAULT_WORK_RULES.DAILY_STAFF_BASE;

    const max =
      typeof parsed.DAILY_STAFF_MAX === 'number'
        ? parsed.DAILY_STAFF_MAX
        : typeof legacyDaily === 'number'
          ? legacyDaily
          : DEFAULT_WORK_RULES.DAILY_STAFF_MAX;

    return {
      DAILY_STAFF_BASE: base,
      DAILY_STAFF_MAX: Math.max(base, max),
      WORK_HOURS: typeof parsed.WORK_HOURS === 'number' ? parsed.WORK_HOURS : DEFAULT_WORK_RULES.WORK_HOURS,
      BREAK_HOURS: typeof parsed.BREAK_HOURS === 'number' ? parsed.BREAK_HOURS : DEFAULT_WORK_RULES.BREAK_HOURS
    };
  } catch {
    return DEFAULT_WORK_RULES;
  }
}

export function saveWorkRules(rules: WorkRules): void {
  if (!isBrowser()) return;
  localStorage.setItem(WORK_RULES_STORAGE_KEY, JSON.stringify(rules));
}
