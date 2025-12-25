import { Schedule, Person, ShiftType, StaffConfig } from './types';
import { STORAGE_KEY, STAFF_CONFIG_KEY } from './constants';

function normalizePerson(raw: Person): Person {
  const canOpen = typeof raw.canOpen === 'boolean' ? raw.canOpen : true;
  const canClose = typeof raw.canClose === 'boolean' ? raw.canClose : true;
  const canMiddle = typeof (raw as Person).canMiddle === 'boolean' ? (raw as Person).canMiddle : true;

  const mustOpen = typeof raw.mustOpen === 'boolean' ? raw.mustOpen : false;
  const mustClose = typeof raw.mustClose === 'boolean' ? raw.mustClose : false;

  const requestedDaysOff = Array.isArray(raw.requestedDaysOff) ? raw.requestedDaysOff : [];
  const halfRequests = raw.halfRequests && typeof raw.halfRequests === 'object' ? raw.halfRequests : {};

  const preferredShiftRaw = (raw as Person).preferredShift as unknown;
  const preferredShift: ShiftType =
    preferredShiftRaw === 'open' || preferredShiftRaw === 'middle' || preferredShiftRaw === 'close'
      ? preferredShiftRaw
      : 'middle';

  const openPriority = typeof raw.openPriority === 'number' ? raw.openPriority : undefined;
  const middlePriority = typeof raw.middlePriority === 'number' ? raw.middlePriority : undefined;
  const closePriority = typeof raw.closePriority === 'number' ? raw.closePriority : undefined;

  return {
    ...raw,
    canOpen,
    canMiddle,
    canClose,
    mustOpen,
    mustClose,
    preferredShift,
    requestedDaysOff,
    halfRequests,
    openPriority,
    middlePriority,
    closePriority
  };
}

function normalizeStaffConfig(raw: any): StaffConfig {
  const id = typeof raw?.id === 'string' ? raw.id : String(Math.random()).slice(2);
  const name = typeof raw?.name === 'string' ? raw.name : 'Unnamed';
  const canOpen = typeof raw?.canOpen === 'boolean' ? raw.canOpen : true;
  const canMiddle = typeof raw?.canMiddle === 'boolean' ? raw.canMiddle : true;
  const canClose = typeof raw?.canClose === 'boolean' ? raw.canClose : true;
  const mustOpen = typeof raw?.mustOpen === 'boolean' ? raw.mustOpen : undefined;
  const mustClose = typeof raw?.mustClose === 'boolean' ? raw.mustClose : undefined;
  const preferredShift = raw?.preferredShift === 'open' || raw?.preferredShift === 'middle' || raw?.preferredShift === 'close' ? raw.preferredShift : null;
  const openPriority = typeof raw?.openPriority === 'number' ? raw.openPriority : undefined;
  const middlePriority = typeof raw?.middlePriority === 'number' ? raw.middlePriority : undefined;
  const closePriority = typeof raw?.closePriority === 'number' ? raw.closePriority : undefined;

  return {
    id,
    name,
    canOpen,
    canMiddle,
    canClose,
    mustOpen,
    mustClose,
    preferredShift,
    openPriority,
    middlePriority,
    closePriority
  };
}

function normalizeSchedule(raw: Schedule): Schedule {
  const people = Array.isArray(raw.people) ? raw.people.map(normalizePerson) : [];
  const dailyStaffByDate = raw.dailyStaffByDate && typeof raw.dailyStaffByDate === 'object' ? raw.dailyStaffByDate : undefined;
  const assignments = Array.isArray(raw.assignments) ? raw.assignments : [];

  return {
    ...raw,
    people,
    dailyStaffByDate,
    assignments
  };
}

export function saveSchedule(schedule: Schedule): void {
  const schedules = loadSchedules();
  const existingIndex = schedules.findIndex(s => s.id === schedule.id);
  
  if (existingIndex >= 0) {
    schedules[existingIndex] = { ...schedule, updatedAt: new Date().toISOString() };
  } else {
    schedules.push(schedule);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function loadSchedules(): Schedule[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as Schedule[];
    return Array.isArray(parsed) ? parsed.map(normalizeSchedule) : [];
  } catch {
    return [];
  }
}

export function deleteSchedule(id: string): void {
  const schedules = loadSchedules().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function getScheduleById(id: string): Schedule | undefined {
  const schedules = loadSchedules();
  return schedules.find(s => s.id === id);
}

// --- StaffConfig storage (global staff composition) ---
export function saveStaffConfig(config: StaffConfig[]): void {
  try {
    const normalized = Array.isArray(config) ? config.map(c => normalizeStaffConfig(c)) : [];
    localStorage.setItem(STAFF_CONFIG_KEY, JSON.stringify(normalized));
  } catch (e) {
    // ignore
  }
}

export function loadStaffConfig(): StaffConfig[] {
  const data = localStorage.getItem(STAFF_CONFIG_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as any[];
    return Array.isArray(parsed) ? parsed.map(normalizeStaffConfig) : [];
  } catch {
    return [];
  }
}

export function deleteStaffConfig(): void {
  localStorage.removeItem(STAFF_CONFIG_KEY);
}

// Helper for potential migration from existing schedules to staff config.
// Intentionally left inactive to avoid accidental automatic migration.
export function migrateStaffFromSchedules(): StaffConfig[] {
  const schedules = loadSchedules();
  // Example helper: extract unique people across schedules
  const map: Record<string, StaffConfig> = {};
  schedules.forEach(s => {
    s.people.forEach(p => {
      if (!map[p.id]) {
        map[p.id] = {
          id: p.id,
          name: p.name,
          canOpen: p.canOpen,
          canMiddle: p.canMiddle,
          canClose: p.canClose,
          mustOpen: p.mustOpen || undefined,
          mustClose: p.mustClose || undefined,
          preferredShift: p.preferredShift || null
        };
      }
    });
  });
  return Object.values(map);
}
