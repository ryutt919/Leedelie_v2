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

    return {
      OPEN_TIME: typeof parsed.OPEN_TIME === 'string' ? parsed.OPEN_TIME : DEFAULT_WORK_RULES.OPEN_TIME,
      CLOSE_TIME: typeof parsed.CLOSE_TIME === 'string' ? parsed.CLOSE_TIME : DEFAULT_WORK_RULES.CLOSE_TIME,
      DAILY_STAFF: typeof parsed.DAILY_STAFF === 'number' ? parsed.DAILY_STAFF : DEFAULT_WORK_RULES.DAILY_STAFF,
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
