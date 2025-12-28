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
  needBoost: boolean // base -> base+1 (or +0.5 in later polish)
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
  year: number
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


