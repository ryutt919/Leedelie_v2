export type Id = string

export type YearMonth = {
  year: number
  month: number // 1-12
}

export type WorkRules = {
  DAILY_STAFF_BASE: number // 0.5 step
  DAILY_STAFF_MAX: number // 0.5 step
  WORK_HOURS: number
  BREAK_HOURS: number
}

export type Shift = 'open' | 'middle' | 'close'

export type StaffMember = {
  id: Id
  name: string
  availableShifts: Shift[]
  requiredShift?: Shift
  preferredShift?: Shift
  priority: Record<Shift, number> // higher is better
}

export type DayRequest = {
  dateISO: string // YYYY-MM-DD
  offStaffIds: Id[]
  halfStaff: Array<{ staffId: Id; shift: Shift }>
  /**
   * 날짜별 필요 인원 조정값(근무 규칙 DAILY_STAFF_BASE 대비 Δ).
   * - 0.5 단위(0, 0.5, 1.0 ...)
   * - 실제 필요 인원 = clamp(BASE + Δ, BASE, MAX)
   */
  needDelta: number
  /** @deprecated 하위 호환용(구버전 데이터) */
  needBoost?: boolean
}

export type ScheduleAssignment = {
  dateISO: string
  byShift: Record<Shift, Array<{ staffId: Id; unit: 1 | 0.5 }>>
}

export type ScheduleStats = {
  staffId: Id
  name: string
  offDays: number
  halfDays: number
  fullDays: number
  workUnits: number // full=1, half=0.5
}

export type SavedSchedule = {
  id: Id
  /**
   * 스케줄 기간(포함 범위)
   * - YYYY-MM-DD
   */
  startDateISO: string
  endDateISO: string
  /**
   * @deprecated (하위 호환/표시용) startDateISO 기준의 연/월
   * - 기간 스케줄(월/년도 넘어감)에서도 startDateISO의 연/월이 들어갑니다.
   */
  year: number
  /** @deprecated (하위 호환/표시용) startDateISO 기준의 월(1-12) */
  month: number // 1-12
  createdAtISO: string
  updatedAtISO: string
  workRules: WorkRules
  staff: StaffMember[]
  requests: DayRequest[]
  assignments: ScheduleAssignment[]
  stats: ScheduleStats[]
  editSourceScheduleId?: Id
}

export type Ingredient = {
  id: Id
  name: string
  purchasePrice: number
  purchaseUnit: number
  unitPrice: number
  updatedAtISO: string
}

export type PrepIngredientItem = {
  ingredientId: Id
  ingredientName: string
  amount: number
}

export type Prep = {
  id: Id
  name: string
  items: PrepIngredientItem[]
  restockDatesISO: string[]
  updatedAtISO: string
}


