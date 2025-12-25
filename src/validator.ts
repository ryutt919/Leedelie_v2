import { Person, ValidationError } from './types';
import { getWorkRules } from './workRules';

export function validateScheduleInputs(
  year: number,
  month: number,
  people: Person[],
  dailyStaffByDate: Record<number, number> = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const rules = getWorkRules();

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
      if (shift === 'close' && !person.canClose) {
        errors.push({ type: 'conflict', message: `${person.name || `${index + 1}번째 인원`}의 ${day}일 하프는 마감으로 선택했지만 마감 근무가 불가능합니다.` });
      }
    });

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
    const requiredStaff = dailyStaffByDate[date] ?? rules.DAILY_STAFF;

    // 풀근무 인원(=근무 인원으로 인정) 후보: 휴무가 아니고, 하프도 아닌 사람
    const availableFullForDay = people.filter(p => !p.requestedDaysOff.includes(date) && p.halfRequests?.[date] === undefined);

    // 해당 날짜에 고정된 하프 요청 인원 수 체크(하프는 근무 인원으로 미포함)
    const fixedHalfCount = people.filter(p => p.halfRequests?.[date] !== undefined).length;
    if (fixedHalfCount > 0 && availableFullForDay.length === 0) {
      // 풀근무 후보가 없으면 반드시 실패하므로 미리 알려줌
      errors.push({
        type: 'insufficient',
        message: `${date}일: 하프 요청 인원이 ${fixedHalfCount}명이고 풀근무 가능한 인원이 없습니다.`
      });
    }
    
    if (availableFullForDay.length < requiredStaff) {
      errors.push({
        type: 'insufficient',
        message: `${date}일: 풀근무 가능한 인원이 ${availableFullForDay.length}명으로 부족합니다. (필요: ${requiredStaff}명)`
      });
    }
    
    const canOpenOnDay = availableFullForDay.filter(p => p.canOpen).length;
    const canCloseOnDay = availableFullForDay.filter(p => p.canClose).length;
    
    if (canOpenOnDay === 0) {
      errors.push({ type: 'no-opener', message: `${date}일: 오픈 가능한 인원이 없습니다.` });
    }
    if (canCloseOnDay === 0) {
      errors.push({ type: 'no-closer', message: `${date}일: 마감 가능한 인원이 없습니다.` });
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
