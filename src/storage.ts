import { Schedule, Person, ShiftType } from './types';
import { STORAGE_KEY } from './constants';

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

  return {
    ...raw,
    canOpen,
    canMiddle,
    canClose,
    mustOpen,
    mustClose,
    preferredShift,
    requestedDaysOff,
    halfRequests
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
