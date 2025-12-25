// 근무 규칙
export type WorkRules = {
  DAILY_STAFF: number;
  WORK_HOURS: number;
  BREAK_HOURS: number;
};

export const DEFAULT_WORK_RULES: WorkRules = {
  DAILY_STAFF: 3,
  WORK_HOURS: 8,
  BREAK_HOURS: 1
};

// 로컬 스토리지 키
export const STORAGE_KEY = 'leedeli_schedules';

// 근무 규칙 로컬 스토리지 키
export const WORK_RULES_STORAGE_KEY = 'leedeli_work_rules';
