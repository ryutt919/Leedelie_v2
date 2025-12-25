import { Person, DayAssignment, Schedule, ShiftType, ValidationError } from './types';
import { getDaysInMonth } from './validator';
import * as XLSX from 'xlsx';
import { getWorkRules } from './workRules';

// headcount에 따른 우선순위 반환
export function getShiftPriorityForHeadcount(rules: any, headcount: number): ShiftType[] {
  const defaultPriority: ShiftType[] = ['open', 'close', 'middle'];
  const map = rules?.SHIFT_PRIORITY ?? null;
  if (!map || typeof map !== 'object') return defaultPriority;

  const keys = Object.keys(map)
    .map(k => parseInt(k, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (keys.length === 0) return defaultPriority;

  // 동일 키가 있으면 사용, 없으면 headcount보다 작거나 같은 최대 키 사용, 없으면 가장 작은 키 사용
  let chosenKey: number | undefined = keys.find(k => k === headcount);
  if (chosenKey === undefined) {
    const le = keys.filter(k => k <= headcount);
    chosenKey = le.length > 0 ? le[le.length - 1] : keys[0];
  }

  const p = map[chosenKey as any];
  if (!Array.isArray(p) || p.length === 0) return defaultPriority;
  return p as ShiftType[];
}

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

  const toHalfUnits = (value: number): number => Math.round(value * 2);

  schedule.assignments.forEach(day => {
    const requiredStaff = dailyStaffByDate[day.date] ?? rules.DAILY_STAFF_BASE;
    const requiredUnits = toHalfUnits(requiredStaff);

    const halfCount = day.people.filter(p => p.isHalf).length;
    const fullCount = day.people.filter(p => !p.isHalf).length;
    const assignedUnits = fullCount * 2 + Math.floor(halfCount / 2) * 2;

    const openCount = day.people.filter(p => p.shift === 'open').length;
    const middleCount = day.people.filter(p => p.shift === 'middle').length;
    const closeCount = day.people.filter(p => p.shift === 'close').length;

    const headcount = day.people.length;
    const needsThreeShift = headcount >= 3 || halfCount >= 2;

    // 총 인원 체크
    if (assignedUnits !== requiredUnits) {
      errors.push({
        type: 'insufficient-staff',
        message: `${day.date}일: 배정된 근무 인원(환산)이 ${assignedUnits / 2}명입니다. (필요: ${requiredStaff}명)`
      });
    }

    // 오픈조 최소 1명 체크
    if (openCount === 0) {
      errors.push({
        type: 'no-opener-assigned',
        message: `${day.date}일: 오픈조에 배정된 인원이 없습니다.`
      });
    }

    // 3교대 조건이면 미들 최소 1명
    if (needsThreeShift && middleCount === 0) {
      errors.push({
        type: 'no-middle-assigned',
        message: `${day.date}일: 3교대 조건인데 미들조에 배정된 인원이 없습니다.`
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

  const toHalfUnits = (value: number): number => Math.round(value * 2);

  const pickPreferred = (candidates: Person[], shift: ShiftType): number => {
    // \uc6b0\uc120\uc21c\uc704\uac00 \uc124\uc815\ub41c \uc0ac\ub78c\uc744 \uba3c\uc800 \ucc3e\uc74c
    const getPriority = (p: Person): number | undefined => {
      if (shift === 'open') return p.openPriority;
      if (shift === 'middle') return p.middlePriority;
      return p.closePriority;
    };

    // \uc6b0\uc120\uc21c\uc704\uac00 \uc788\ub294 \ud6c4\ubcf4\ub4e4 \ucc3e\uae30
    const withPriority = candidates
      .map((p, idx) => ({ person: p, index: idx, priority: getPriority(p) }))
      .filter(item => item.priority !== undefined)
      .sort((a, b) => a.priority! - b.priority!); // \ub0ae\uc740 \uc22b\uc790\uac00 \ub192\uc740 \uc6b0\uc120\uc21c\uc704

    if (withPriority.length > 0) {
      return withPriority[0].index;
    }

    // \uc6b0\uc120\uc21c\uc704\uac00 \uc5c6\uc73c\uba74 \uc120\ud638 \uc2dc\ud504\ud2b8\ub85c \uc120\ud0dd
    const preferredIndex = candidates.findIndex(p => p.preferredShift === shift);
    return preferredIndex >= 0 ? preferredIndex : 0;
  };

  // 각 날짜별로 배정
  for (let date = 1; date <= daysInMonth; date++) {
    const requiredStaff = dailyStaffByDate[date] ?? rules.DAILY_STAFF_BASE;
    const requiredUnits = toHalfUnits(requiredStaff);
    const dayAssignment: DayAssignment = {
      date,
      people: []
    };

    // 해당 날짜에 근무 가능한 사람(휴무 제외)
    const availablePeople = people.filter(person => !person.requestedDaysOff.includes(date));

    // 하프 요청은 먼저 고정 배정 (하프는 0.5 인원)
    availablePeople.forEach(person => {
      const requestedShift = person.halfRequests?.[date];
      if (requestedShift === undefined) return;

      // 오픈/미들/마감 가능 여부 필요
      if (requestedShift === 'open' && !person.canOpen) return;
      if (requestedShift === 'middle' && !person.canMiddle) return;
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

    const fixedHalfCount = dayAssignment.people.filter(p => p.isHalf).length;
    const remainingUnits = requiredUnits - Math.floor(fixedHalfCount / 2) * 2;

    if (remainingUnits < 0) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 하프 인원(${fixedHalfCount}명 = ${Math.floor(fixedHalfCount / 2)}인)가 필요 인원(${requiredStaff}인)을 초과합니다.`
      });
      assignments.push(dayAssignment);
      continue;
    }
    if (remainingUnits % 2 !== 0) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 필요 인원(${requiredStaff}인)을 맞추기 위해 하프(0.5 단위)가 추가로 필요합니다.`
      });
      assignments.push(dayAssignment);
      continue;
    }

    const requiredFullCount = remainingUnits / 2;

    const plannedHeadcount = requiredFullCount + fixedHalfCount;
    const needsThreeShift = plannedHeadcount >= 3 || fixedHalfCount >= 2;

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

    // 나머지 풀근무 인원 배치 (requiredFullCount까지)
    const alreadyAssignedFull = new Set(dayAssignment.people.filter(p => !p.isHalf).map(p => p.personId));
    const remainingPeople = availableFullPeople.filter(p => !alreadyAssignedFull.has(p.id));

    while (dayAssignment.people.filter(p => !p.isHalf).length < requiredFullCount) {
      const openCountAll = dayAssignment.people.filter(p => p.shift === 'open').length;
      const middleCountAll = dayAssignment.people.filter(p => p.shift === 'middle').length;
      const closeCountAll = dayAssignment.people.filter(p => p.shift === 'close').length;
      // 우선 필수 요구(오픈/마감/미들)가 비어있으면 우선 채움
      if (openCountAll === 0 || closeCountAll === 0 || (needsThreeShift && middleCountAll === 0)) {
        let forced: ShiftType | null = null;
        if (openCountAll === 0) forced = 'open';
        else if (closeCountAll === 0) forced = 'close';
        else if (needsThreeShift && middleCountAll === 0) forced = 'middle';

        if (forced) {
          let eligibleForced = remainingPeople.filter(p => {
            if (forced === 'open') return p.canOpen;
            if (forced === 'middle') return p.canMiddle;
            return p.canClose;
          });
          if (eligibleForced.length === 0) {
            generationErrors.push({ type: 'insufficient-staff', message: `${date}일: ${forced} 배정이 가능한 풀근무 인원이 부족합니다.` });
            break;
          }
          const pick = pickPreferred(eligibleForced, forced);
          const pickedId = eligibleForced[pick].id;
          const pickIndexInRemaining = remainingPeople.findIndex(p => p.id === pickedId);
          const person = remainingPeople.splice(pickIndexInRemaining, 1)[0];
          dayAssignment.people.push({ personId: person.id, personName: person.name, shift: forced, isHalf: false });
          continue;
        }
      }

      // 우선순위 기반으로 시프트 선택
      const priority = getShiftPriorityForHeadcount(rules, plannedHeadcount);
      let assigned = false;
      for (const shift of priority) {
        // 2교대 모드이면 미들은 풀근무 후보에서 제외
        if (!needsThreeShift && shift === 'middle') continue;

        const eligible = remainingPeople.filter(p => {
          if (shift === 'open') return p.canOpen;
          if (shift === 'middle') return p.canMiddle;
          return p.canClose;
        });

        if (eligible.length === 0) continue;

        const pick = pickPreferred(eligible, shift);
        const pickedId = eligible[pick].id;
        const pickIndexInRemaining = remainingPeople.findIndex(p => p.id === pickedId);
        const person = remainingPeople.splice(pickIndexInRemaining, 1)[0];

        // 2교대 모드에서 middle인 경우는 다른 시프트로 보정
        let finalShift: ShiftType = shift;
        if (!needsThreeShift && finalShift === 'middle') {
          finalShift = person.preferredShift === 'close' && person.canClose ? 'close' : 'open';
        }

        dayAssignment.people.push({ personId: person.id, personName: person.name, shift: finalShift, isHalf: false });
        assigned = true;
        break;
      }

      if (!assigned) {
        generationErrors.push({ type: 'insufficient-staff', message: `${date}일: 배정 가능한 풀근무 인원이 부족합니다.` });
        break;
      }
    }

    // 생성 결과(해당 날짜)가 규칙을 만족하는지 즉시 검증
    const halfCountAfter = dayAssignment.people.filter(p => p.isHalf).length;
    const fullCountAfter = dayAssignment.people.filter(p => !p.isHalf).length;
    const assignedUnitsAfter = fullCountAfter * 2 + Math.floor(halfCountAfter / 2) * 2;

    const openCount = dayAssignment.people.filter(p => p.shift === 'open').length;
    const middleCount = dayAssignment.people.filter(p => p.shift === 'middle').length;
    const closeCount = dayAssignment.people.filter(p => p.shift === 'close').length;

    if (assignedUnitsAfter !== requiredUnits) {
      generationErrors.push({
        type: 'insufficient-staff',
        message: `${date}일: 배정된 근무 인원(환산)이 ${assignedUnitsAfter / 2}명입니다. (필요: ${requiredStaff}명)`
      });
    }
    if (openCount === 0) {
      generationErrors.push({
        type: 'no-opener-assigned',
        message: `${date}일: 오픈조에 배정된 인원이 없습니다.`
      });
    }
    if (needsThreeShift && middleCount === 0) {
      generationErrors.push({
        type: 'no-middle-assigned',
        message: `${date}일: 3교대 조건인데 미들조에 배정된 인원이 없습니다.`
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
