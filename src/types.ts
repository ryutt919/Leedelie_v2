// 근무 타입
export type ShiftType = 'open' | 'middle' | 'close';

// 인원 정보
export interface Person {
  id: string;
  name: string;
  canOpen: boolean;
  canMiddle: boolean;
  canClose: boolean;
  mustOpen: boolean;
  mustClose: boolean;
  preferredShift: ShiftType;
  openPriority?: number;  // 오픈 우선순위 (1~총직원수)
  middlePriority?: number;  // 미들 우선순위 (1~총직원수)
  closePriority?: number;  // 마감 우선순위 (1~총직원수)
  requestedDaysOff: number[];
  halfRequests: Record<number, ShiftType>;
}

// 날짜별 배정
export interface DayAssignment {
  date: number;
  people: {
    personId: string;
    personName: string;
    shift: ShiftType;
    isHalf?: boolean;
  }[];
}

// 스케줄
export interface Schedule {
  id: string;
  year: number;
  month: number;
  people: Person[];
  dailyStaffByDate?: Record<number, number>;
  assignments: DayAssignment[];
  createdAt: string;
  updatedAt: string;
}

// 검증 오류
export interface ValidationError {
  type: string;
  message: string;
}

// 전역 직원 구성(스케줄과 별개)
export interface StaffConfig {
  id: string;
  name: string;
  canOpen: boolean;
  canMiddle: boolean;
  canClose: boolean;
  mustOpen?: boolean;
  mustClose?: boolean;
  preferredShift?: ShiftType | null;
  openPriority?: number;
  middlePriority?: number;
  closePriority?: number;
}
