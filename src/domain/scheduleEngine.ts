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

const MIN_SHIFT_UNITS = 0.5 // 오픈/마감 최소(하프 0.5도 1명으로 인정)

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)] ?? null
}

function candidateScoreForShift({
  staff,
  shift,
  workload,
}: {
  staff: StaffMember
  shift: Shift
  workload: Map<string, number>
}) {
  const w = workload.get(staff.id) ?? 0
  const pr = staff.priority?.[shift] ?? 0
  const pref = staff.preferredShift === shift ? 1 : 0
  // 우선순위(shift priority) 중심 + 선호 약간 + workload는 약한 페널티
  return pr * 10 + pref * 5 - w * 2
}

function pickBestCandidateForShift({
  candidates,
  shift,
  workload,
}: {
  candidates: StaffMember[]
  shift: Shift
  workload: Map<string, number>
}) {
  let bestScore = -Infinity
  const bests: StaffMember[] = []
  for (const s of candidates) {
    const score = candidateScoreForShift({ staff: s, shift, workload })
    if (score > bestScore) {
      bestScore = score
      bests.length = 0
      bests.push(s)
    } else if (score === bestScore) {
      bests.push(s)
    }
  }
  // 동점이면 랜덤
  return pickRandom(bests)
}

function pickBestShiftForStaff({
  staff,
  workload,
}: {
  staff: StaffMember
  workload: Map<string, number>
}): Shift | null {
  // requiredShift가 있으면 무조건 그 시프트
  if (staff.requiredShift) return staff.requiredShift
  const shifts = staff.availableShifts
  if (!shifts.length) return null

  let bestScore = -Infinity
  const bests: Shift[] = []
  for (const sh of shifts) {
    const score = candidateScoreForShift({ staff, shift: sh, workload })
    if (score > bestScore) {
      bestScore = score
      bests.length = 0
      bests.push(sh)
    } else if (score === bestScore) {
      bests.push(sh)
    }
  }
  return pickRandom(bests)
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
    const needForFill = Math.max(need, MIN_SHIFT_UNITS * 2) // 오픈/마감 최소(합 1.0) 때문에 최소 need는 1.0로 보정

    const assignedIds = new Set<string>()
    const byShift: Record<Shift, Array<{ staffId: string; unit: 1 | 0.5 }>> = { open: [], middle: [], close: [] }

    // 1) 하프 요청 고정(0.5) + (방어) 잘못된 shift면 가능한 shift로 보정
    for (const h of req.halfStaff) {
      if (req.offStaffIds.includes(h.staffId)) continue
      const s = input.staff.find((x) => x.id === h.staffId)
      if (!s) continue
      let shift: Shift | null = null
      if (s.availableShifts.includes(h.shift) && (!s.requiredShift || s.requiredShift === h.shift)) {
        shift = h.shift
      } else {
        shift = pickBestShiftForStaff({ staff: s, workload })
      }
      if (!shift) continue

      byShift[shift].push({ staffId: s.id, unit: 0.5 })
      workload.set(s.id, (workload.get(s.id) ?? 0) + 0.5)
      assignedIds.add(s.id)
    }

    const currentUnits = () =>
      (byShift.open.reduce((a, b) => a + b.unit, 0) +
        byShift.middle.reduce((a, b) => a + b.unit, 0) +
        byShift.close.reduce((a, b) => a + b.unit, 0)) as number

    const canWorkBase = () => input.staff.filter((s) => !req.offStaffIds.includes(s.id) && !assignedIds.has(s.id))

    const pickAndAssignToShift = (shift: Shift) => {
      const candidates = canWorkBase().filter((s) => {
        if (!s.availableShifts.includes(shift)) return false
        if (s.requiredShift && s.requiredShift !== shift) return false
        return true
      })
      const best = pickBestCandidateForShift({ candidates, shift, workload })
      if (!best) return false
      byShift[shift].push({ staffId: best.id, unit: 1 })
      workload.set(best.id, (workload.get(best.id) ?? 0) + 1)
      assignedIds.add(best.id)
      return true
    }

    // 2) 오픈/마감 최소 0.5 강제(need와 무관하게 우선 충족)
    if (byShift.open.reduce((sum, x) => sum + x.unit, 0) < MIN_SHIFT_UNITS) pickAndAssignToShift('open')
    if (byShift.close.reduce((sum, x) => sum + x.unit, 0) < MIN_SHIFT_UNITS) pickAndAssignToShift('close')

    // 3) 나머지는 필요 인원(needForFill)까지 우선순위 기반으로 채움(동점 랜덤)
    while (currentUnits() < needForFill) {
      const pool = canWorkBase()
      if (!pool.length) break

      // 후보별로 "자기에게 가장 높은 우선순위 시프트"를 계산해서, 그 점수가 높은 사람부터 배정
      let bestScore = -Infinity
      const bestCandidates: Array<{ staff: StaffMember; shift: Shift }> = []
      for (const s of pool) {
        const sh = pickBestShiftForStaff({ staff: s, workload })
        if (!sh) continue
        const score = candidateScoreForShift({ staff: s, shift: sh, workload })
        if (score > bestScore) {
          bestScore = score
          bestCandidates.length = 0
          bestCandidates.push({ staff: s, shift: sh })
        } else if (score === bestScore) {
          bestCandidates.push({ staff: s, shift: sh })
        }
      }
      const pick = pickRandom(bestCandidates)
      if (!pick) break

      byShift[pick.shift].push({ staffId: pick.staff.id, unit: 1 })
      workload.set(pick.staff.id, (workload.get(pick.staff.id) ?? 0) + 1)
      assignedIds.add(pick.staff.id)
    }

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


