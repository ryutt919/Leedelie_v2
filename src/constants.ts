// 근무 규칙
export type WorkRules = {
  OPEN_TIME: string;
  CLOSE_TIME: string;
  DAILY_STAFF: number;
  WORK_HOURS: number;
  BREAK_HOURS: number;
};

export const DEFAULT_WORK_RULES: WorkRules = {
  OPEN_TIME: '07:00',
  CLOSE_TIME: '11:00',
  DAILY_STAFF: 3,
  WORK_HOURS: 8,
  BREAK_HOURS: 1
};

// 로컬 스토리지 키
export const STORAGE_KEY = 'leedeli_schedules';

// 근무 규칙 로컬 스토리지 키
export const WORK_RULES_STORAGE_KEY = 'leedeli_work_rules';
