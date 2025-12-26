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

// 재료
export interface Ingredient {
  id: string;
  name: string;
  price: number;
  purchaseUnit: number;
  unitPrice: number;
}

// 프렙 재료
export interface PrepIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
}

// 프렙
export interface Prep {
  id: string;
  name: string;
  ingredients: PrepIngredient[];
  replenishHistory: string[]; // 보충 날짜 배열 (ISO 8601 형식)
  nextReplenishDate?: string; // 다음 보충 예상 날짜 (ISO 8601 형식)
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

// CSV 프리뷰 관련 타입
export type CsvAction = 'create' | 'update' | 'merge' | 'skip';

export interface CsvPreviewItem {
  rowNumber: number; // 원본 CSV 상의 행 번호(1-based)
  raw: string; // 원본 행 텍스트
  parsed: Record<string, string | number | string[]>; // 파싱된 필드들 (키는 페이지별 규약)
  // detectedMatch may include a reference to an existing item under `existing` for preview display
  detectedMatch?: { type: 'id' | 'name_exact' | 'name_ci'; id?: string; existing?: any };
  recommendedAction: CsvAction;
  validationErrors: string[];
}
