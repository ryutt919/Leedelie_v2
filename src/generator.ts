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

  schedule.assignments.forEach(day => {
    const openCount = day.people.filter(p => p.shift === 'open').length;
    const closeCount = day.people.filter(p => p.shift === 'close').length;
    const totalCount = day.people.length;

    // 총 인원 체크
    if (totalCount !== rules.DAILY_STAFF) {
      errors.push({
        type: 'insufficient-staff',
        message: `${day.date}일: 배정된 인원이 ${totalCount}명입니다. (필요: ${rules.DAILY_STAFF}명)`
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
  });

  return errors;
}

export function generateSchedule(year: number, month: number, people: Person[]): Schedule {
  const daysInMonth = getDaysInMonth(year, month);
  const assignments: DayAssignment[] = [];
  const generationErrors: ValidationError[] = [];
  const rules = getWorkRules();

  // 각 날짜별로 배정
  for (let date = 1; date <= daysInMonth; date++) {
    const dayAssignment: DayAssignment = {
      date,
      people: []
    };

    // 해당 날짜에 근무 가능한 사람 필터링
    const availablePeople = people.filter(person => 
      !person.requestedDaysOff.includes(date)
    );

    // 필수 오픈 인원 중 한 명 배치 (휴무가 아닌 경우)
    const mustOpenPeople = availablePeople.filter(p => p.mustOpen && p.canOpen);
    if (mustOpenPeople.length > 0) {
      const person = mustOpenPeople[0];
      dayAssignment.people.push({
        personId: person.id,
        personName: person.name,
        shift: 'open'
      });
    }

    // 필수 마감 인원 중 한 명 배치 (휴무가 아닌 경우)
    const mustClosePeople = availablePeople.filter(p => p.mustClose && p.canClose);
    if (mustClosePeople.length > 0) {
      const person = mustClosePeople[0];
      if (!dayAssignment.people.find(p => p.personId === person.id)) {
        dayAssignment.people.push({
          personId: person.id,
          personName: person.name,
          shift: 'close'
        });
      }
    }

    // 나머지 인원 배치 (총 3명까지)
    const alreadyAssigned = dayAssignment.people.map(p => p.personId);
    const remainingPeople = availablePeople.filter(p => !alreadyAssigned.includes(p.id));

    while (dayAssignment.people.length < rules.DAILY_STAFF && remainingPeople.length > 0) {
      const person = remainingPeople.shift()!;
      
      // 오픈이 부족하면 오픈 가능한 사람 배치
      const openCount = dayAssignment.people.filter(p => p.shift === 'open').length;
      const closeCount = dayAssignment.people.filter(p => p.shift === 'close').length;

      let shift: ShiftType;
      if (openCount === 0 && person.canOpen) {
        shift = 'open';
      } else if (closeCount === 0 && person.canClose) {
        shift = 'close';
      } else if (person.canOpen && person.canClose) {
        shift = openCount <= closeCount ? 'open' : 'close';
      } else if (person.canOpen) {
        shift = 'open';
      } else if (person.canClose) {
        shift = 'close';
      } else {
        continue;
      }

      dayAssignment.people.push({
        personId: person.id,
        personName: person.name,
        shift
      });
    }

    // 생성 결과(해당 날짜)가 규칙을 만족하는지 즉시 검증
    const openCount = dayAssignment.people.filter(p => p.shift === 'open').length;
    const closeCount = dayAssignment.people.filter(p => p.shift === 'close').length;
    const totalCount = dayAssignment.people.length;

    if (totalCount !== rules.DAILY_STAFF) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 배정된 인원이 ${totalCount}명입니다. (필요: ${rules.DAILY_STAFF}명)`
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
      const assignedByPersonId = new Map<string, 'open' | 'close'>();
      if (assignment) {
        assignment.people.forEach(p => {
          assignedByPersonId.set(p.personId, p.shift);
        });
      }

      const perPerson = schedule.people.map(p => {
        const shift = assignedByPersonId.get(p.id);
        if (shift === 'open') return '오픈';
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
      const assignedByPersonId = new Map<string, 'open' | 'close'>();
      if (assignment) {
        assignment.people.forEach(p => assignedByPersonId.set(p.personId, p.shift));
      }

      const row = [day.toString(), ...schedule.people.map(p => {
        const shift = assignedByPersonId.get(p.id);
        if (shift === 'open') return '오픈';
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
