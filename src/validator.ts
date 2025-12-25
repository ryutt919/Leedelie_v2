import { Person, ValidationError } from './types';

export function validateScheduleInputs(
  year: number,
  month: number,
  people: Person[]
): ValidationError[] {
  const errors: ValidationError[] = [];

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

  // 필수 인원 검증
  const mustOpenPeople = people.filter(p => p.mustOpen);
  const mustClosePeople = people.filter(p => p.mustClose);

  if (mustOpenPeople.length === 0) {
    errors.push({ type: 'required', message: '오픈 필수 인원이 최소 1명은 필요합니다.' });
  }
  if (mustClosePeople.length === 0) {
    errors.push({ type: 'required', message: '마감 필수 인원이 최소 1명은 필요합니다.' });
  }

  // 필수 인원이 해당 시프트 가능한지 검증
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

  return errors;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
