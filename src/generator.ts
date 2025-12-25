import { Person, DayAssignment, Schedule, ShiftType } from './types';
import { WORK_RULES } from './constants';
import { getDaysInMonth } from './validator';

export function generateSchedule(year: number, month: number, people: Person[]): Schedule {
  const daysInMonth = getDaysInMonth(year, month);
  const assignments: DayAssignment[] = [];

  // 각 날짜별로 배정
  for (let date = 1; date <= daysInMonth; date++) {
    const dayOfWeek = new Date(year, month - 1, date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const dayAssignment: DayAssignment = {
      date,
      people: []
    };

    // 해당 날짜에 근무 가능한 사람 필터링
    const availablePeople = people.filter(person => 
      !person.requestedDaysOff.includes(date)
    );

    // 필수 오픈 인원 배치
    const mustOpenPeople = availablePeople.filter(p => p.mustOpen && p.canOpen);
    if (mustOpenPeople.length > 0) {
      const person = mustOpenPeople[0];
      dayAssignment.people.push({
        personId: person.id,
        personName: person.name,
        shift: 'open'
      });
    }

    // 필수 마감 인원 배치
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

    assignments.push(dayAssignment);
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
