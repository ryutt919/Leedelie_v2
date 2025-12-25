import { Schedule } from './types';
import { STORAGE_KEY } from './constants';

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
  return data ? JSON.parse(data) : [];
}

export function deleteSchedule(id: string): void {
  const schedules = loadSchedules().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function getScheduleById(id: string): Schedule | undefined {
  const schedules = loadSchedules();
  return schedules.find(s => s.id === id);
}
