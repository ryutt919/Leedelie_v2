import type { DayRequest, SavedSchedule, ScheduleAssignment, ScheduleStats, Shift, StaffMember, WorkRules } from './types'
import dayjs from 'dayjs'
import { daysInRangeISO, isISODate } from '../utils/date'

export type ScheduleInputs = {
  startDateISO: string
  endDateISO: string
  workRules: WorkRules
  staff: StaffMember[]
  requests: DayRequest[]
}

export function validateScheduleInputs(input: ScheduleInputs): string[] {
  const errs: string[] = []
  if (!isISODate(input.startDateISO)) errs.push('시작일이 올바르지 않습니다.')
  if (!isISODate(input.endDateISO)) errs.push('종료일이 올바르지 않습니다.')
  if (isISODate(input.startDateISO) && isISODate(input.endDateISO)) {
    const s = dayjs(input.startDateISO, 'YYYY-MM-DD', true)
    const e = dayjs(input.endDateISO, 'YYYY-MM-DD', true)
    if (e.isBefore(s, 'day')) errs.push('종료일은 시작일 이후여야 합니다.')
    // 모바일 MVP 방어: 너무 긴 기간은 제한(1년 + 여유)
    if (e.diff(s, 'day') > 370) errs.push('기간이 너무 깁니다. 371일 이내로 선택하세요.')
  }
  if (!input.staff.length) errs.push('직원이 1명 이상 필요합니다.')
  for (const s of input.staff) {
    if (!s.name.trim()) errs.push('직원 이름이 비었습니다.')
    if (!s.availableShifts.length) errs.push(`${s.name || '(이름없음)'}: 가능 시프트를 1개 이상 선택하세요.`)
    if (s.requiredShift && !s.availableShifts.includes(s.requiredShift)) errs.push(`${s.name}: 필수 시프트가 가능 시프트에 포함되어야 합니다.`)
    if (s.preferredShift && !s.availableShifts.includes(s.preferredShift)) errs.push(`${s.name}: 선호 시프트가 가능 시프트에 포함되어야 합니다.`)
  }
  if (input.workRules.DAILY_STAFF_BASE < 0.5) errs.push('기본 근무 인원은 0.5 이상이어야 합니다.')
  if (input.workRules.DAILY_STAFF_MAX < input.workRules.DAILY_STAFF_BASE) errs.push('최대 근무 인원은 기본 이상이어야 합니다.')
  if (input.workRules.WORK_HOURS <= 0) errs.push('근무시간이 올바르지 않습니다.')
  if (input.workRules.BREAK_HOURS < 0) errs.push('휴게시간이 올바르지 않습니다.')
  return errs
}

function shiftQuota(total: number): Record<Shift, number> {
  // 단순 모바일 MVP: 최소 오픈/마감 1명(가능하면), 나머지는 미들
  if (total <= 1) return { open: 0, middle: 1, close: 0 }
  // 요구: 근무 인원이 2명 이상이면 미들도 포함되게
  // 단, 오픈/마감 최소 1명 규칙은 validateGeneratedSchedule에서 hard-fail로 강제됨.
  // 여기서는 quota를 최대한 middle을 포함하는 방향으로 배분한다.
  if (total === 2) return { open: 1, middle: 1, close: 0 }
  return { open: 1, middle: Math.max(1, total - 2), close: 1 }
}

function pickBestCandidate({
  candidates,
  shift,
  workload,
}: {
  candidates: StaffMember[]
  shift: Shift
  workload: Map<string, number>
}) {
  let best: StaffMember | null = null
  let bestScore = -Infinity
  for (const s of candidates) {
    const w = workload.get(s.id) ?? 0
    const pr = s.priority?.[shift] ?? 0
    const pref = s.preferredShift === shift ? 1 : 0
    const score = pr * 10 + pref * 5 - w * 2
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

export function generateSchedule(input: ScheduleInputs): { assignments: ScheduleAssignment[]; stats: ScheduleStats[] } {
  const dates = daysInRangeISO(input.startDateISO, input.endDateISO)
  const reqByDate = new Map(input.requests.map((r) => [r.dateISO, r]))

  const workload = new Map<string, number>() // unit sum
  const nameById = new Map(input.staff.map((s) => [s.id, s.name]))

  const assignments: ScheduleAssignment[] = []

  for (const dateISO of dates) {
    const req =
      reqByDate.get(dateISO) ??
      ({
        dateISO,
        offStaffIds: [],
        halfStaff: [],
        needDelta: 0,
      } satisfies DayRequest)
    const delta = Number.isFinite(req.needDelta) ? req.needDelta : req.needBoost ? 1 : 0
    const baseNeed = input.workRules.DAILY_STAFF_BASE + delta
    const need = Math.min(input.workRules.DAILY_STAFF_MAX, Math.max(input.workRules.DAILY_STAFF_BASE, baseNeed))

    const assignedIds = new Set<string>()
    const byShift: Record<Shift, Array<{ staffId: string; unit: 1 | 0.5 }>> = { open: [], middle: [], close: [] }

    // 1) 하프 요청 고정(0.5)
    for (const h of req.halfStaff) {
      if (req.offStaffIds.includes(h.staffId)) continue
      const s = input.staff.find((x) => x.id === h.staffId)
      if (!s) continue
      if (!s.availableShifts.includes(h.shift)) continue
      byShift[h.shift].push({ staffId: s.id, unit: 0.5 })
      workload.set(s.id, (workload.get(s.id) ?? 0) + 0.5)
      assignedIds.add(s.id)
    }

    const currentUnits = () =>
      (byShift.open.reduce((a, b) => a + b.unit, 0) +
        byShift.middle.reduce((a, b) => a + b.unit, 0) +
        byShift.close.reduce((a, b) => a + b.unit, 0)) as number

    const fullSlots = Math.max(0, Math.ceil(need - currentUnits()))
    const quota = shiftQuota(fullSlots)

    const canWork = input.staff.filter((s) => !req.offStaffIds.includes(s.id) && !assignedIds.has(s.id))

    const fillShift = (shift: Shift, count: number) => {
      for (let i = 0; i < count; i++) {
        const candidates = canWork.filter((s) => {
          if (assignedIds.has(s.id)) return false
          if (!s.availableShifts.includes(shift)) return false
          if (s.requiredShift && s.requiredShift !== shift) return false
          return true
        })
        const best = pickBestCandidate({ candidates, shift, workload })
        if (!best) break
        byShift[shift].push({ staffId: best.id, unit: 1 })
        workload.set(best.id, (workload.get(best.id) ?? 0) + 1)
        assignedIds.add(best.id)
      }
    }

    fillShift('open', quota.open)
    fillShift('close', quota.close)
    fillShift('middle', quota.middle)

    assignments.push({ dateISO, byShift })
  }

  const stats: ScheduleStats[] = input.staff.map((s) => {
    let offDays = 0
    let halfDays = 0
    let fullDays = 0
    for (const a of assignments) {
      const req = reqByDate.get(a.dateISO)
      if (req?.offStaffIds.includes(s.id)) {
        offDays++
        continue
      }
      const units =
        a.byShift.open.filter((x) => x.staffId === s.id).reduce((sum, x) => sum + x.unit, 0) +
        a.byShift.middle.filter((x) => x.staffId === s.id).reduce((sum, x) => sum + x.unit, 0) +
        a.byShift.close.filter((x) => x.staffId === s.id).reduce((sum, x) => sum + x.unit, 0)
      if (units === 0.5) halfDays++
      else if (units >= 1) fullDays++
    }
    const workUnits = (workload.get(s.id) ?? 0) as number
    return { staffId: s.id, name: nameById.get(s.id) ?? s.name, offDays, halfDays, fullDays, workUnits }
  })

  return { assignments, stats }
}

export function validateGeneratedSchedule(input: ScheduleInputs, assignments: ScheduleAssignment[]): string[] {
  const errs: string[] = []
  const reqByDate = new Map(input.requests.map((r) => [r.dateISO, r]))
  for (const a of assignments) {
    const req = reqByDate.get(a.dateISO)
    // 오픈/마감 최소 1명 강제(불가능하면 hard fail)
    const openUnits = a.byShift.open.reduce((sum, x) => sum + x.unit, 0)
    const closeUnits = a.byShift.close.reduce((sum, x) => sum + x.unit, 0)
    const MIN_SHIFT_UNITS = 0.5 // 하프(0.5)도 1명으로 인정
    if (openUnits < MIN_SHIFT_UNITS || closeUnits < MIN_SHIFT_UNITS) {
      const offCount = req?.offStaffIds?.length ?? 0
      const availableOpen = input.staff.filter((s) => !req?.offStaffIds.includes(s.id) && s.availableShifts.includes('open')).length
      const availableClose = input.staff.filter((s) => !req?.offStaffIds.includes(s.id) && s.availableShifts.includes('close')).length
      const parts: string[] = []
      if (openUnits < MIN_SHIFT_UNITS) parts.push(`오픈<${MIN_SHIFT_UNITS}`)
      if (closeUnits < MIN_SHIFT_UNITS) parts.push(`마감<${MIN_SHIFT_UNITS}`)
      errs.push(
        `${a.dateISO}: 오픈/마감 최소 0.5 규칙 위반(${parts.join(', ')}). ` +
          `휴무 ${offCount}명, 가능(오픈 ${availableOpen}명/마감 ${availableClose}명)`
      )
    }
    for (const shift of ['open', 'middle', 'close'] as Shift[]) {
      for (const asg of a.byShift[shift]) {
        const staff = input.staff.find((s) => s.id === asg.staffId)
        if (!staff) errs.push(`${a.dateISO}: 존재하지 않는 직원 배정`)
        else {
          if (!staff.availableShifts.includes(shift)) errs.push(`${a.dateISO}: ${staff.name}는 ${shift} 불가`)
          if (staff.requiredShift && staff.requiredShift !== shift) errs.push(`${a.dateISO}: ${staff.name} 필수시프트 위반`)
        }
        if (req?.offStaffIds.includes(asg.staffId)) errs.push(`${a.dateISO}: 휴무 직원 배정됨`)
      }
    }
  }
  return errs
}

export function toSavedSchedule({
  id,
  editSourceScheduleId,
  input,
  assignments,
  stats,
}: {
  id: string
  editSourceScheduleId?: string
  input: ScheduleInputs
  assignments: ScheduleAssignment[]
  stats: ScheduleStats[]
}): SavedSchedule {
  const now = new Date().toISOString()
  const start = dayjs(input.startDateISO, 'YYYY-MM-DD', true)
  const year = start.isValid() ? start.year() : dayjs().year()
  const month = start.isValid() ? start.month() + 1 : dayjs().month() + 1
  return {
    id,
    startDateISO: input.startDateISO,
    endDateISO: input.endDateISO,
    year,
    month,
    createdAtISO: now,
    updatedAtISO: now,
    workRules: input.workRules,
    staff: input.staff,
    requests: input.requests,
    assignments,
    stats,
    editSourceScheduleId,
  }
}


