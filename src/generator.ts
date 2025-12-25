import { Person, DayAssignment, Schedule, ShiftType, ValidationError } from './types';
import { getDaysInMonth } from './validator';
import * as XLSX from 'xlsx';
import { getWorkRules } from './workRules';

export class ScheduleGenerationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super('Schedule generation failed');
    this.name = 'ScheduleGenerationError';
    this.errors = errors;
  }
}

export function validateGeneratedSchedule(schedule: Schedule): ValidationError[] {
  const errors: ValidationError[] = [];
  const rules = getWorkRules();
  const dailyStaffByDate = schedule.dailyStaffByDate ?? {};

  schedule.assignments.forEach(day => {
    const requiredStaff = dailyStaffByDate[day.date] ?? rules.DAILY_STAFF;
    const fullPeople = day.people.filter(p => !p.isHalf);
    const openCount = fullPeople.filter(p => p.shift === 'open').length;
    const closeCount = fullPeople.filter(p => p.shift === 'close').length;
    const totalCount = fullPeople.length;

    // 총 인원 체크
    if (totalCount !== requiredStaff) {
      errors.push({
        type: 'insufficient-staff',
        message: `${day.date}일: 배정된 풀근무 인원이 ${totalCount}명입니다. (필요: ${requiredStaff}명)`
      });
    }

    // 오픈조 최소 1명 체크
    if (openCount === 0) {
      errors.push({
        type: 'no-opener-assigned',
        message: `${day.date}일: 오픈조에 배정된 인원이 없습니다.`
      });
    }

    // 마감조 최소 1명 체크
    if (closeCount === 0) {
      errors.push({
        type: 'no-closer-assigned',
        message: `${day.date}일: 마감조에 배정된 인원이 없습니다.`
      });
    }

    // 하프 요청이 있다면 해당 시프트로 배정되었는지 확인
    schedule.people.forEach(person => {
      const requested = person.halfRequests?.[day.date];
      if (requested === undefined) return;

      const assigned = day.people.find(p => p.personId === person.id);
      if (!assigned) {
        errors.push({
          type: 'half-not-assigned',
          message: `${day.date}일: ${person.name}님의 하프(${requested}) 요청이 배정되지 않았습니다.`
        });
        return;
      }
      if (!assigned.isHalf) {
        errors.push({
          type: 'half-not-marked',
          message: `${day.date}일: ${person.name}님의 하프 요청이 풀근무로 배정되었습니다.`
        });
      }
      if (assigned.shift !== requested) {
        errors.push({
          type: 'half-shift-mismatch',
          message: `${day.date}일: ${person.name}님의 하프 시프트가 요청(${requested})과 다릅니다. (배정: ${assigned.shift})`
        });
      }
    });
  });

  return errors;
}

export function generateSchedule(
  year: number,
  month: number,
  people: Person[],
  dailyStaffByDate: Record<number, number> = {}
): Schedule {
  const daysInMonth = getDaysInMonth(year, month);
  const assignments: DayAssignment[] = [];
  const generationErrors: ValidationError[] = [];
  const rules = getWorkRules();

  // 각 날짜별로 배정
  for (let date = 1; date <= daysInMonth; date++) {
    const requiredStaff = dailyStaffByDate[date] ?? rules.DAILY_STAFF;
    const dayAssignment: DayAssignment = {
      date,
      people: []
    };

    // 해당 날짜에 근무 가능한 사람(휴무 제외)
    const availablePeople = people.filter(person => !person.requestedDaysOff.includes(date));

    // 하프 요청은 먼저 고정 배정 (하프는 근무 인원으로 미포함)
    availablePeople.forEach(person => {
      const requestedShift = person.halfRequests?.[date];
      if (requestedShift === undefined) return;

      // 오픈/마감은 가능 여부 필요 (미들은 제한 없음)
      if (requestedShift === 'open' && !person.canOpen) return;
      if (requestedShift === 'close' && !person.canClose) return;

      dayAssignment.people.push({
        personId: person.id,
        personName: person.name,
        shift: requestedShift,
        isHalf: true
      });
    });

    // 풀근무 후보: 휴무가 아니고, 하프 요청이 없는 사람
    const availableFullPeople = availablePeople.filter(p => p.halfRequests?.[date] === undefined);

    // 필수 오픈 인원 중 한 명 배치 (풀근무 후보)
    const mustOpenPeople = availableFullPeople.filter(p => p.mustOpen && p.canOpen);
    if (mustOpenPeople.length > 0) {
      const person = mustOpenPeople[0];
      const already = dayAssignment.people.find(p => p.personId === person.id);
      if (!already) {
        dayAssignment.people.push({
          personId: person.id,
          personName: person.name,
          shift: 'open',
          isHalf: false
        });
      }
    }

    // 필수 마감 인원 중 한 명 배치 (풀근무 후보)
    const mustClosePeople = availableFullPeople.filter(p => p.mustClose && p.canClose);
    if (mustClosePeople.length > 0) {
      const person = mustClosePeople[0];
      if (!dayAssignment.people.find(p => p.personId === person.id)) {
        dayAssignment.people.push({
          personId: person.id,
          personName: person.name,
          shift: 'close',
          isHalf: false
        });
      }
    }

    // 나머지 풀근무 인원 배치 (requiredStaff까지)
    const alreadyAssignedFull = new Set(dayAssignment.people.filter(p => !p.isHalf).map(p => p.personId));
    const remainingPeople = availableFullPeople.filter(p => !alreadyAssignedFull.has(p.id));

    while (dayAssignment.people.filter(p => !p.isHalf).length < requiredStaff) {
      const fullPeopleNow = dayAssignment.people.filter(p => !p.isHalf);
      const openCount = fullPeopleNow.filter(p => p.shift === 'open').length;
      const closeCount = fullPeopleNow.filter(p => p.shift === 'close').length;

      let neededShift: ShiftType;
      if (openCount === 0) neededShift = 'open';
      else if (closeCount === 0) neededShift = 'close';
      else neededShift = 'middle';

      let pickIndex = -1;
      if (neededShift === 'open') {
        pickIndex = remainingPeople.findIndex(p => p.canOpen);
      } else if (neededShift === 'close') {
        pickIndex = remainingPeople.findIndex(p => p.canClose);
      } else {
        pickIndex = remainingPeople.findIndex(() => true);
      }

      if (pickIndex === -1) break;

      const person = remainingPeople.splice(pickIndex, 1)[0];

      dayAssignment.people.push({
        personId: person.id,
        personName: person.name,
        shift: neededShift,
        isHalf: false
      });
    }

    // 생성 결과(해당 날짜)가 규칙을 만족하는지 즉시 검증
    const fullPeopleAfter = dayAssignment.people.filter(p => !p.isHalf);
    const openCount = fullPeopleAfter.filter(p => p.shift === 'open').length;
    const closeCount = fullPeopleAfter.filter(p => p.shift === 'close').length;
    const totalCount = fullPeopleAfter.length;

    if (totalCount !== requiredStaff) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 배정된 풀근무 인원이 ${totalCount}명입니다. (필요: ${requiredStaff}명)`
      });
    }
    if (openCount === 0) {
      generationErrors.push({
        type: 'no-opener-assigned',
        message: `${date}일: 오픈조에 배정된 인원이 없습니다.`
      });
    }
    if (closeCount === 0) {
      generationErrors.push({
        type: 'no-closer-assigned',
        message: `${date}일: 마감조에 배정된 인원이 없습니다.`
      });
    }

    // 하프 요청 충족 여부(방어적)
    people.forEach(person => {
      const requestedShift = person.halfRequests?.[date];
      if (requestedShift === undefined) return;
      const assigned = dayAssignment.people.find(p => p.personId === person.id);
      if (!assigned) {
        generationErrors.push({
          type: 'half-not-assigned',
          message: `${date}일: ${person.name}님의 하프(${requestedShift}) 요청이 배정되지 않았습니다.`
        });
        return;
      }
      if (!assigned.isHalf) {
        generationErrors.push({
          type: 'half-not-marked',
          message: `${date}일: ${person.name}님의 하프 요청이 풀근무로 배정되었습니다.`
        });
      }
      if (assigned.shift !== requestedShift) {
        generationErrors.push({
          type: 'half-shift-mismatch',
          message: `${date}일: ${person.name}님의 하프 시프트가 요청(${requestedShift})과 다릅니다. (배정: ${assigned.shift})`
        });
      }
    });

    assignments.push(dayAssignment);
  }

  if (generationErrors.length > 0) {
    throw new ScheduleGenerationError(generationErrors);
  }

  return {
    id: crypto.randomUUID(),
    year,
    month,
    people,
    dailyStaffByDate,
    assignments,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function csvEscape(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

export function exportSchedulesToExcelCsv(schedules: Schedule[]): void {
  const rows: string[] = [];

  schedules.forEach((schedule, scheduleIndex) => {
    if (scheduleIndex > 0) rows.push('');

    const monthLabel = `${schedule.year}.${String(schedule.month).padStart(2, '0')}`;
    const header = [monthLabel, ...schedule.people.map(p => p.name)];
    rows.push(header.map(csvEscape).join(','));

    const daysInMonth = getDaysInMonth(schedule.year, schedule.month);

    for (let day = 1; day <= daysInMonth; day++) {
      const assignment = schedule.assignments.find(a => a.date === day);
      const assignedByPersonId = new Map<string, ShiftType>();
      const isHalfByPersonId = new Map<string, boolean>();
      if (assignment) {
        assignment.people.forEach(p => {
          assignedByPersonId.set(p.personId, p.shift);
          isHalfByPersonId.set(p.personId, !!p.isHalf);
        });
      }

      const perPerson = schedule.people.map(p => {
        const shift = assignedByPersonId.get(p.id);
        const isHalf = isHalfByPersonId.get(p.id) === true;
        if (shift && isHalf) {
          if (shift === 'open') return '하프-오픈';
          if (shift === 'middle') return '하프-미들';
          return '하프-마감';
        }
        if (shift === 'open') return '오픈';
        if (shift === 'middle') return '미들';
        if (shift === 'close') return '마감';
        return '휴무';
      });

      rows.push([String(day), ...perPerson].map(csvEscape).join(','));
    }
  });

  // Excel 한글 깨짐 방지용 BOM
  const bom = '\uFEFF';
  const csv = bom + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `leedeli_schedules_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSchedulesToXlsx(schedules: Schedule[]): void {
  const wb = XLSX.utils.book_new();

  schedules.forEach((schedule) => {
    const monthLabel = `${schedule.year}.${String(schedule.month).padStart(2, '0')}`;
    const header = [monthLabel, ...schedule.people.map(p => p.name)];

    const daysInMonth = getDaysInMonth(schedule.year, schedule.month);
    const aoa: any[][] = [];
    aoa.push(header);

    for (let day = 1; day <= daysInMonth; day++) {
      const assignment = schedule.assignments.find(a => a.date === day);
      const assignedByPersonId = new Map<string, ShiftType>();
      const isHalfByPersonId = new Map<string, boolean>();
      if (assignment) {
        assignment.people.forEach(p => {
          assignedByPersonId.set(p.personId, p.shift);
          isHalfByPersonId.set(p.personId, !!p.isHalf);
        });
      }

      const row = [day.toString(), ...schedule.people.map(p => {
        const shift = assignedByPersonId.get(p.id);
        const isHalf = isHalfByPersonId.get(p.id) === true;
        if (shift && isHalf) {
          if (shift === 'open') return '하프-오픈';
          if (shift === 'middle') return '하프-미들';
          return '하프-마감';
        }
        if (shift === 'open') return '오픈';
        if (shift === 'middle') return '미들';
        if (shift === 'close') return '마감';
        return '휴무';
      })];

      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const sheetName = `${schedule.year}_${String(schedule.month).padStart(2, '0')}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `leedeli_schedules_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
