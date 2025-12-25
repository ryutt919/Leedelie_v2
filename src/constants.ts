import { ShiftType } from './types';

// 근무 규칙
export type WorkRules = {
  DAILY_STAFF_BASE: number;
  DAILY_STAFF_MAX: number;
  WORK_HOURS: number;
  BREAK_HOURS: number;
  SHIFT_PRIORITY?: Record<number, ShiftType[]>;
};

export const DEFAULT_WORK_RULES: WorkRules = {
  DAILY_STAFF_BASE: 2,
  DAILY_STAFF_MAX: 3,
  WORK_HOURS: 8,
  BREAK_HOURS: 1,
  SHIFT_PRIORITY: {
    1: ['open', 'close', 'middle'],
    2: ['open', 'close'],
    3: ['open', 'middle', 'close']
  }
};

// 로컬 스토리지 키
export const STORAGE_KEY = 'leedeli_schedules';

// 근무 규칙 로컬 스토리지 키
export const WORK_RULES_STORAGE_KEY = 'leedeli_work_rules';
export const STAFF_CONFIG_KEY = 'leedeli_staff_config';
