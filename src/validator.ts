import { Person, ValidationError, ShiftType } from './types';
import { getWorkRules } from './workRules';

export function validateScheduleInputs(
  year: number,
  month: number,
  people: Person[],
  dailyStaffByDate: Record<number, number> = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const rules = getWorkRules();

  const toHalfUnits = (value: number): number => Math.round(value * 2);
  const isHalfStep = (value: number): boolean => Number.isFinite(value) && Number.isInteger(value * 2);

  // 연도/월 검증
  if (!year || year < 2000 || year > 2100) {
    errors.push({ type: 'year', message: '연도를 올바르게 선택해주세요.' });
  }
  if (!month || month < 1 || month > 12) {
    errors.push({ type: 'month', message: '월을 올바르게 선택해주세요.' });
  }

  // 인원 검증
  if (people.length === 0) {
    errors.push({ type: 'people', message: '최소 1명 이상의 인원을 추가해주세요.' });
    return errors;
  }

  // 규칙 검증
  if (!isHalfStep(rules.DAILY_STAFF_BASE) || rules.DAILY_STAFF_BASE < 0.5) {
    errors.push({ type: 'rules', message: '기본 근무 인원은 0.5 단위로 0.5 이상이어야 합니다.' });
  }
  if (!isHalfStep(rules.DAILY_STAFF_MAX) || rules.DAILY_STAFF_MAX < rules.DAILY_STAFF_BASE) {
    errors.push({ type: 'rules', message: '최대 근무 인원은 0.5 단위이며 기본 근무 인원 이상이어야 합니다.' });
  }

  // SHIFT_PRIORITY 구조 검사 (옵셔널)
  if (rules.SHIFT_PRIORITY !== undefined) {
    if (typeof rules.SHIFT_PRIORITY !== 'object' || Array.isArray(rules.SHIFT_PRIORITY)) {
      errors.push({ type: 'rules', message: 'SHIFT_PRIORITY는 숫자 키에 시프트 배열 값인 객체여야 합니다.' });
    } else {
      Object.entries(rules.SHIFT_PRIORITY).forEach(([k, v]) => {
        const keyNum = parseInt(k, 10);
        if (Number.isNaN(keyNum)) {
          errors.push({ type: 'rules', message: `SHIFT_PRIORITY의 키(${k})는 숫자여야 합니다.` });
          return;
        }
        if (!Array.isArray(v) || v.length === 0) {
          errors.push({ type: 'rules', message: `SHIFT_PRIORITY[${k}]는 최소 하나 이상의 시프트를 포함한 배열이어야 합니다.` });
          return;
        }
        v.forEach((s: any) => {
          if (s !== 'open' && s !== 'middle' && s !== 'close') {
            errors.push({ type: 'rules', message: `SHIFT_PRIORITY[${k}]에 잘못된 시프트 값이 포함되어 있습니다: ${String(s)}` });
          }
        });
      });
    }
  }

  // 날짜별 필요 인원 오버라이드 검증
  Object.entries(dailyStaffByDate).forEach(([dayStr, value]) => {
    const day = parseInt(dayStr);
    if (!day || day < 1 || day > 31) return;
    if (!isHalfStep(value)) {
      errors.push({ type: 'rules', message: `${day}일: 필요 인원은 0.5 단위로만 설정할 수 있습니다.` });
      return;
    }
    if (value < rules.DAILY_STAFF_BASE || value > rules.DAILY_STAFF_MAX) {
      errors.push({
        type: 'rules',
        message: `${day}일: 필요 인원은 기본(${rules.DAILY_STAFF_BASE})~최대(${rules.DAILY_STAFF_MAX}) 사이여야 합니다.`
      });
    }
  });

  // 이름 검증
  people.forEach((person, index) => {
    if (!person.name.trim()) {
      errors.push({ type: 'name', message: `${index + 1}번째 인원의 이름을 입력해주세요.` });
    }

    // 휴무/하프 충돌 금지
    const halfDays = Object.keys(person.halfRequests).map(d => parseInt(d));
    const conflictDays = halfDays.filter(d => person.requestedDaysOff.includes(d));
    if (conflictDays.length > 0) {
      errors.push({
        type: 'conflict',
        message: `${person.name || `${index + 1}번째 인원`}의 ${conflictDays.sort((a, b) => a - b).join(', ')}일은 휴무와 하프를 동시에 선택할 수 없습니다.`
      });
    }

    // 하프 시프트 유효성(오픈/마감은 가능 여부 필요)
    halfDays.forEach(day => {
      const shift = person.halfRequests[day];
      if (shift === 'open' && !person.canOpen) {
        errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 ${day}일 하프는 오픈으로 선택했지만 오픈 근무가 불가능합니다.` });
      }
      if (shift === 'middle' && !person.canMiddle) {
        errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 ${day}일 하프는 미들로 선택했지만 미들 근무가 불가능합니다.` });
      }
      if (shift === 'close' && !person.canClose) {
        errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 ${day}일 하프는 마감으로 선택했지만 마감 근무가 불가능합니다.` });
      }
    });

    // 선호 시프트 유효성
    if (person.preferredShift === 'open' && !person.canOpen) {
      errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 선호 시프트가 오픈이지만 오픈 근무가 불가능합니다.` });
    }
    if (person.preferredShift === 'middle' && !person.canMiddle) {
      errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 선호 시프트가 미들이지만 미들 근무가 불가능합니다.` });
    }
    if (person.preferredShift === 'close' && !person.canClose) {
      errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 선호 시프트가 마감이지만 마감 근무가 불가능합니다.` });
    }

    // 오픈/마감 필수인 사람은 하프 요청이 해당 시프트와 충돌하면 안 됨
    halfDays.forEach(day => {
      const shift = person.halfRequests[day];
      if (person.mustOpen || person.mustClose) {
        errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}은 오픈/마감 필수 설정이 있어 하프를 선택할 수 없습니다. (${day}일)` });
        return;
      }

      // (방어적) 필수 플래그가 없다면 추가 충돌 규칙은 없음
      void shift;
    });

    // 우선순위 검증
    const totalPeople = people.length;
    if (person.openPriority !== undefined) {
      if (person.openPriority < 1 || person.openPriority > totalPeople) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}의 오픈 우선순위는 1~${totalPeople} 사이여야 합니다.` });
      }
      if (!person.canOpen) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}은 오픈 근무가 불가능하므로 오픈 우선순위를 설정할 수 없습니다.` });
      }
    }
    if (person.middlePriority !== undefined) {
      if (person.middlePriority < 1 || person.middlePriority > totalPeople) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}의 미들 우선순위는 1~${totalPeople} 사이여야 합니다.` });
      }
      if (!person.canMiddle) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}은 미들 근무가 불가능하므로 미들 우선순위를 설정할 수 없습니다.` });
      }
    }
    if (person.closePriority !== undefined) {
      if (person.closePriority < 1 || person.closePriority > totalPeople) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}의 마감 우선순위는 1~${totalPeople} 사이여야 합니다.` });
      }
      if (!person.canClose) {
        errors.push({ type: 'priority', message: `${person.name || `${index + 1}번째 인원`}은 마감 근무가 불가능하므로 마감 우선순위를 설정할 수 없습니다.` });
      }
    }
  });

  // 오픈/마감 가능 인원 검증
  const canOpenPeople = people.filter(p => p.canOpen);
  const canClosePeople = people.filter(p => p.canClose);

  if (canOpenPeople.length === 0) {
    errors.push({ type: 'shift', message: '오픈 근무가 가능한 인원이 최소 1명은 필요합니다.' });
  }
  if (canClosePeople.length === 0) {
    errors.push({ type: 'shift', message: '마감 근무가 가능한 인원이 최소 1명은 필요합니다.' });
  }

  // 필수 인원이 해당 시프트 가능한지 검증
  const mustOpenPeople = people.filter(p => p.mustOpen);
  const mustClosePeople = people.filter(p => p.mustClose);

  mustOpenPeople.forEach(person => {
    if (!person.canOpen) {
      errors.push({ type: 'conflict', message: `${person.name}님은 오픈 필수로 설정되었지만 오픈 근무가 불가능합니다.` });
    }
  });
  mustClosePeople.forEach(person => {
    if (!person.canClose) {
      errors.push({ type: 'conflict', message: `${person.name}님은 마감 필수로 설정되었지만 마감 근무가 불가능합니다.` });
    }
  });

  // 스케줄 생성 가능 여부 검증 (일별 인원 배치 가능한지)
  const daysInMonth = getDaysInMonth(year, month);
  
  // 필수 인원이 있는 경우, 각 날짜별로 최소 1명의 필수 인원이 가능한지 확인
  const hasMustOpen = mustOpenPeople.length > 0;
  const hasMustClose = mustClosePeople.length > 0;
  
  for (let date = 1; date <= daysInMonth; date++) {
    const requiredStaff = dailyStaffByDate[date] ?? rules.DAILY_STAFF_BASE;
    const requiredUnits = toHalfUnits(requiredStaff);

    // 고정된 하프(0.5) 인원(휴무는 이미 충돌 금지)
    const fixedHalfPeople = people.filter(p => !p.requestedDaysOff.includes(date) && p.halfRequests?.[date] !== undefined);
    // 하프는 2명(짝수)마다 1명으로 환산됨. 내부 단위는 half-units(0.5단위->1)
    const fixedHalfUnits = Math.floor(fixedHalfPeople.length / 2) * 2; // 예: 1명->0, 2명->2

    // 풀근무 후보: 휴무가 아니고, 하프도 아닌 사람 (1.0 = 2 units)
    const availableFullForDay = people.filter(p => !p.requestedDaysOff.includes(date) && p.halfRequests?.[date] === undefined);

    const remainingUnits = requiredUnits - fixedHalfUnits;
    if (remainingUnits < 0) {
      errors.push({
        type: 'insufficient',
        message: `${date}일: 하프 인원(${fixedHalfPeople.length}명, 짝수로 환산 ${fixedHalfUnits / 2}인)이 필요 인원(${requiredStaff}인)을 초과합니다.`
      });
      continue;
    }
    if (remainingUnits % 2 !== 0) {
      errors.push({
        type: 'insufficient',
        message: `${date}일: 필요 인원(${requiredStaff}인)을 맞추려면 하프 요청(0.5 단위)이 추가로 필요합니다.`
      });
      continue;
    }

    const requiredFullCount = remainingUnits / 2;
    if (availableFullForDay.length < requiredFullCount) {
      errors.push({
        type: 'insufficient',
        message: `${date}일: 풀근무 가능한 인원이 ${availableFullForDay.length}명으로 부족합니다. (필요: ${requiredFullCount}명, 하프: ${fixedHalfPeople.length}명)`
      });
    }

    // 3교대 조건: 근무 인원(헤드카운트) 3명 이상 또는 하프 2명 이상
    // 헤드카운트는 짝수 하프(한 쌍)를 1명으로 환산하여 계산
    const plannedHeadcount = requiredFullCount + Math.floor(fixedHalfPeople.length / 2);
    const needsThreeShift = plannedHeadcount >= 3 || fixedHalfPeople.length >= 2;

    const fixedHasOpen = fixedHalfPeople.some(p => p.halfRequests?.[date] === 'open');
    const fixedHasMiddle = fixedHalfPeople.some(p => p.halfRequests?.[date] === 'middle');
    const fixedHasClose = fixedHalfPeople.some(p => p.halfRequests?.[date] === 'close');

    const canCoverOpen = fixedHasOpen || availableFullForDay.some(p => p.canOpen);
    const canCoverClose = fixedHasClose || availableFullForDay.some(p => p.canClose);
    const canCoverMiddle = fixedHasMiddle || availableFullForDay.some(p => p.canMiddle);

    if (!canCoverOpen) {
      errors.push({ type: 'no-opener', message: `${date}일: 오픈을 배정할 수 있는 인원이 없습니다.` });
    }
    if (!canCoverClose) {
      errors.push({ type: 'no-closer', message: `${date}일: 마감을 배정할 수 있는 인원이 없습니다.` });
    }
    if (needsThreeShift && !canCoverMiddle) {
      errors.push({ type: 'no-middle', message: `${date}일: 3교대 조건인데 미들을 배정할 수 있는 인원이 없습니다.` });
    }

    // 하프 고정 배치로 인해 필수 시프트(오픈/마감/미들)를 채울 풀근무 슬롯이 부족한지(필요조건) 체크
    const requiredShifts: ShiftType[] = needsThreeShift ? ['open', 'middle', 'close'] : ['open', 'close'];
    const covered = new Set<ShiftType>();
    if (fixedHasOpen) covered.add('open');
    if (fixedHasMiddle) covered.add('middle');
    if (fixedHasClose) covered.add('close');
    const remainingShifts = requiredShifts.filter(s => !covered.has(s));
    if (remainingShifts.length > requiredFullCount) {
      errors.push({
        type: 'insufficient',
        message: `${date}일: 하프 고정 배치로 인해 필수 시프트(${remainingShifts.join('/')})를 채울 풀근무 인원이 부족합니다.`
      });
    }
    
    // 필수 인원이 설정되어 있다면, 해당 날짜에 필수 인원 중 최소 1명이 가능한지 확인
    if (hasMustOpen) {
      const mustOpenAvailable = availableFullForDay.filter(p => p.mustOpen && p.canOpen).length;
      if (mustOpenAvailable === 0) {
        errors.push({ type: 'no-must-opener', message: `${date}일: 오픈 필수 인원이 모두 휴무입니다.` });
      }
    }
    
    if (hasMustClose) {
      const mustCloseAvailable = availableFullForDay.filter(p => p.mustClose && p.canClose).length;
      if (mustCloseAvailable === 0) {
        errors.push({ type: 'no-must-closer', message: `${date}일: 마감 필수 인원이 모두 휴무입니다.` });
      }
    }
  }

  return errors;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
