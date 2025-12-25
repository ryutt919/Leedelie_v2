// 근무 타입
export type ShiftType = 'open' | 'close';

// 인원 정보
export interface Person {
  id: string;
  name: string;
  canOpen: boolean;
  canClose: boolean;
  mustOpen: boolean;
  mustClose: boolean;
  requestedDaysOff: number[];
  workDaysPerWeek: number;
}

// 날짜별 배정
export interface DayAssignment {
  date: number;
  people: {
    personId: string;
    personName: string;
    shift: ShiftType;
  }[];
}

// 스케줄
export interface Schedule {
  id: string;
  year: number;
  month: number;
  people: Person[];
  assignments: DayAssignment[];
  createdAt: string;
  updatedAt: string;
}

// 검증 오류
export interface ValidationError {
  type: string;
  message: string;
}
