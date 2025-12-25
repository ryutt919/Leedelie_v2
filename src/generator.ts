import { Person, DayAssignment, Schedule, ShiftType, ValidationError } from './types';
import { WORK_RULES } from './constants';
import { getDaysInMonth } from './validator';

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

  schedule.assignments.forEach(day => {
    const openCount = day.people.filter(p => p.shift === 'open').length;
    const closeCount = day.people.filter(p => p.shift === 'close').length;
    const totalCount = day.people.length;

    // 총 인원 체크
    if (totalCount !== WORK_RULES.DAILY_STAFF) {
      errors.push({
        type: 'insufficient-staff',
        message: `${day.date}일: 배정된 인원이 ${totalCount}명입니다. (필요: ${WORK_RULES.DAILY_STAFF}명)`
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

    while (dayAssignment.people.length < WORK_RULES.DAILY_STAFF && remainingPeople.length > 0) {
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

    if (totalCount !== WORK_RULES.DAILY_STAFF) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 배정된 인원이 ${totalCount}명입니다. (필요: ${WORK_RULES.DAILY_STAFF}명)`
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

export function exportToJSON(schedules: Schedule[]): void {
  const dataStr = JSON.stringify(schedules, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `schedules_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
