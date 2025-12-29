import { DownloadOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  DatePicker,
  Calendar,
  Card,
  Checkbox,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  theme,
  message,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DayRequest, SavedSchedule, Shift, StaffMember, WorkRules } from '../domain/types'
import { generateSchedule, toSavedSchedule, validateGeneratedSchedule, validateScheduleInputs } from '../domain/scheduleEngine'
import type { ScheduleInputs } from '../domain/scheduleEngine'
import { MobileShell } from '../layouts/MobileShell'
import { getSchedule, upsertSchedule } from '../storage/schedulesRepo'
import { loadStaffPresets, upsertStaffPreset } from '../storage/staffPresetsRepo'
import type { StaffPreset } from '../storage/staffPresetsRepo'
import { DEFAULT_WORK_RULES, loadWorkRules, saveWorkRules } from '../storage/workRulesRepo'
import { daysInRangeISO } from '../utils/date'
import { newId } from '../utils/id'
import { exportScheduleXlsx } from '../utils/scheduleExport'
import type { CellRenderInfo } from '@rc-component/picker/interface'

const EMPTY_STAFF: StaffMember[] = []

export function CreateSchedulePage() {
  void theme.useToken()
  const [sp] = useSearchParams()
  const editId = sp.get('editId') ?? undefined

  const [form] = Form.useForm()

  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => dayjs())
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [mode, setMode] = useState<'off' | 'half'>('off')
  const [halfShift, setHalfShift] = useState<Shift>('middle')

  const [requests, setRequests] = useState<DayRequest[]>([])
  const [result, setResult] = useState<{ assignments: SavedSchedule['assignments']; stats: SavedSchedule['stats'] } | null>(
    null,
  )

  const [presetModalOpen, setPresetModalOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<StaffPreset[]>(() => loadStaffPresets())
  const lastRangeWarnAtRef = useRef(0)

  const normalizeRequest = (r: Partial<DayRequest> & { dateISO: string }): DayRequest => {
    const base: DayRequest = {
      dateISO: r.dateISO,
      // IMPORTANT: 배열 참조 공유를 끊어야(불변) StrictMode/dev에서 토글이 안정적임
      offStaffIds: [...(((r.offStaffIds ?? []) as string[]) ?? [])],
      halfStaff: [...(((r.halfStaff ?? []) as Array<{ staffId: string; shift: Shift }>) ?? [])],
      needDelta: 0,
    }
    const legacyBoost = (r as { needBoost?: boolean }).needBoost
    const delta = Number.isFinite((r as { needDelta?: number }).needDelta)
      ? Number((r as { needDelta?: number }).needDelta)
      : legacyBoost
        ? 1
        : 0
    return { ...base, needDelta: delta }
  }

  useEffect(() => {
    const workRules = loadWorkRules()
    const today = dayjs()
    let startDateISO = today.startOf('month').format('YYYY-MM-DD')
    let endDateISO = today.endOf('month').format('YYYY-MM-DD')
    let staff: StaffMember[] = []
    let loadedRequests: DayRequest[] = []

    if (editId) {
      const s = getSchedule(editId)
      if (s) {
        startDateISO = s.startDateISO
        endDateISO = s.endDateISO
        staff = s.staff
        loadedRequests = (s.requests ?? []).map((r) => normalizeRequest(r))
        setResult({ assignments: s.assignments, stats: s.stats })
      }
    }

    // 직원이 없으면 최대 인원만큼 빈 직원 생성
    if (!staff.length) {
      const maxCount = workRules.DAILY_STAFF_MAX
      staff = Array.from({ length: maxCount }, () => ({
        id: newId(),
        name: '',
        availableShifts: ['open', 'middle', 'close'] as const,
        priority: { open: 3, middle: 3, close: 3 },
      }))
    }

    setRequests(loadedRequests.map((r) => normalizeRequest(r)))
    form.setFieldsValue({
      range: [dayjs(startDateISO), dayjs(endDateISO)],
      workRules,
      staffCount: staff.length,
      staff,
    })
    setSelectedDate(dayjs(startDateISO))
    setSelectedStaffId(staff[0]?.id ?? null)
  }, [editId, form])

  const getInput = (): ScheduleInputs => {
    const v = form.getFieldsValue(true) as {
      range: [Dayjs, Dayjs]
      workRules: WorkRules
      staff: StaffMember[]
    }
    const range = v.range ?? [dayjs().startOf('month'), dayjs().endOf('month')]
    const startDateISO = range[0].format('YYYY-MM-DD')
    const endDateISO = range[1].format('YYYY-MM-DD')
    const workRules = v.workRules ?? DEFAULT_WORK_RULES
    const staff = (v.staff ?? []).map((s) => ({
      ...s,
      name: (s.name ?? '').toString(),
      availableShifts: s.availableShifts ?? [],
      priority: s.priority ?? { open: 3, middle: 3, close: 3 },
    }))
    return { startDateISO, endDateISO, workRules, staff, requests }
  }

  const updateRequest = (dateISO: string, patch: Partial<DayRequest>) => {
    setRequests((prev) => {
      const idx = prev.findIndex((x) => x.dateISO === dateISO)
      if (idx < 0) return [...prev, { ...normalizeRequest({ dateISO }), ...patch }]
      const next = [...prev]
      next[idx] = normalizeRequest({ ...next[idx], ...patch, dateISO })
      return next
    })
  }

  const toggleForSelected = (dateISO: string) => {
    if (!selectedStaffId) return
    // ensureRequest는 제거 - setRequests 안에서 이미 idx < 0 처리함
    setRequests((prev) => {
      const idx = prev.findIndex((x) => x.dateISO === dateISO)
      const r = idx >= 0 ? prev[idx] : normalizeRequest({ dateISO })
      const next: DayRequest = normalizeRequest({ ...r, dateISO })

      const sid = selectedStaffId
      if (mode === 'off') {
        // off 토글, half는 제거
        const off = new Set(next.offStaffIds)
        if (off.has(sid)) off.delete(sid)
        else off.add(sid)
        next.offStaffIds = [...off]
        next.halfStaff = next.halfStaff.filter((x) => x.staffId !== sid)
      } else {
        // half 토글, off 제거
        next.offStaffIds = next.offStaffIds.filter((x) => x !== sid)
        const has = next.halfStaff.some((x) => x.staffId === sid)
        if (has) {
          // 이미 하프면 해제 (불변)
          next.halfStaff = next.halfStaff.filter((x) => x.staffId !== sid)
        } else {
          // 선호 시프트: preferredShift > priority 최고값 > halfShift 순
          const currentStaff = (form.getFieldValue('staff') ?? []) as StaffMember[]
          const member = currentStaff.find((s) => s.id === sid)
          let shift: Shift = halfShift
          if (member?.preferredShift) {
            shift = member.preferredShift
          } else if (member?.priority) {
            const best = (['open', 'middle', 'close'] as Shift[]).reduce((a, b) =>
              (member.priority[b] ?? 0) > (member.priority[a] ?? 0) ? b : a
            )
            shift = best
          }
          next.halfStaff = [...next.halfStaff, { staffId: sid, shift }]
        }
      }

      const out = [...prev]
      if (idx >= 0) out[idx] = next
      else out.push(next)
      return out
    })
  }

  const onGenerate = () => {
    const input = getInput()
    const errs = validateScheduleInputs(input)
    if (errs.length) {
      message.error(errs[0])
      return
    }
    const gen = generateSchedule(input)
    const postErrs = validateGeneratedSchedule(input, gen.assignments)
    if (postErrs.length) {
      message.error(postErrs[0])
      return
    }
    setResult(gen)
    message.success('스케줄 생성 완료')
  }

  const onSaveSchedule = () => {
    const input = getInput()
    const errs = validateScheduleInputs(input)
    if (errs.length) {
      message.error(errs[0])
      return
    }
    if (!result) {
      message.error('먼저 스케줄을 생성하세요.')
      return
    }
    const id = editId ?? newId()
    const saved = toSavedSchedule({
      id,
      editSourceScheduleId: editId ? editId : undefined,
      input,
      assignments: result.assignments,
      stats: result.stats,
    })
    upsertSchedule(saved)
    saveWorkRules(input.workRules)
    message.success('저장 완료')
  }

  const onExport = () => {
    const input = getInput()
    if (!result) {
      message.error('먼저 스케줄을 생성하세요.')
      return
    }
    const temp: SavedSchedule = {
      id: 'temp',
      startDateISO: input.startDateISO,
      endDateISO: input.endDateISO,
      year: dayjs(input.startDateISO).year(),
      month: dayjs(input.startDateISO).month() + 1,
      createdAtISO: new Date().toISOString(),
      updatedAtISO: new Date().toISOString(),
      workRules: input.workRules,
      staff: input.staff,
      requests: input.requests,
      assignments: result.assignments,
      stats: result.stats,
    }
    exportScheduleXlsx(temp)
  }

  const watchedStaff = Form.useWatch('staff', form) as StaffMember[] | undefined
  const staff: StaffMember[] = watchedStaff ?? EMPTY_STAFF
  const staffCount: number = Form.useWatch('staffCount', form) ?? staff.length ?? 0
  const rangeWatch =
    ((Form.useWatch('range', form) as [Dayjs, Dayjs] | undefined) ?? [dayjs().startOf('month'), dayjs().endOf('month')])
  const workRulesWatch: WorkRules = Form.useWatch('workRules', form) ?? DEFAULT_WORK_RULES
  const rangeISO = useMemo(
    () => ({
      startDateISO: rangeWatch[0].format('YYYY-MM-DD'),
      endDateISO: rangeWatch[1].format('YYYY-MM-DD'),
    }),
    [rangeWatch]
  )
  const validDatesSet = useMemo(() => new Set(daysInRangeISO(rangeISO.startDateISO, rangeISO.endDateISO)), [rangeISO])

  useEffect(() => {
    // 기간 변경 시 선택 날짜가 범위 밖이면 시작일로 정렬
    const start = rangeWatch[0]
    const end = rangeWatch[1]
    if (selectedDate.isBefore(start, 'day') || selectedDate.isAfter(end, 'day')) setSelectedDate(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeWatch])

  const requestForSelectedDate = useMemo(() => {
    const iso = selectedDate.format('YYYY-MM-DD')
    const found = requests.find((r) => r.dateISO === iso)
    return found ? normalizeRequest(found) : normalizeRequest({ dateISO: iso })
  }, [requests, selectedDate])

  const reqByDate = useMemo(() => {
    const m = new Map<string, DayRequest>()
    for (const r of requests) m.set(r.dateISO, normalizeRequest(r))
    return m
  }, [requests])

  const staffNameById = useMemo(() => new Map(staff.map((s) => [s.id, s.name || '이름없음'])), [staff])

  const renderRequestPills = (d: Dayjs) => {
    const iso = d.format('YYYY-MM-DD')
    const r = reqByDate.get(iso)

    const inRange = validDatesSet.has(iso)

    const pills: Array<{ key: string; staffId: string; kind: 'half' | 'off'; text: string }> = []
    if (r) {
      // 이름만 표시 (하프: 주황, 휴무: 파랑)
      for (const h of r.halfStaff) {
        const sid = String(h.staffId)
        const nm = staffNameById.get(sid) ?? sid
        pills.push({
          key: `half_${sid}`,
          staffId: sid,
          kind: 'half',
          text: nm,
        })
      }
      for (const sid of r.offStaffIds) {
        const s = String(sid)
        const nm = staffNameById.get(s) ?? s
        pills.push({
          key: `off_${s}`,
          staffId: s,
          kind: 'off',
          text: nm,
        })
      }
    }

    // 선택된 직원은 배경색으로 표시, 나머지만 pill로 표시
    const selectedSid = selectedStaffId ? String(selectedStaffId) : null
    const otherPills = selectedSid ? pills.filter((p) => p.staffId !== selectedSid) : pills

    // 선택된 직원의 휴무/하프 여부 확인
    const isSelectedOff = !!(selectedSid && r?.offStaffIds.some((x) => String(x) === selectedSid))
    const isSelectedHalf = !!(selectedSid && r?.halfStaff.some((x) => String(x.staffId) === selectedSid))

    // 배경색 결정 (더 진한 색상)
    let bgColor = 'transparent'
    if (isSelectedOff) bgColor = '#bae0ff' // 더 진한 파랑
    else if (isSelectedHalf) bgColor = '#ffe7ba' // 더 진한 주황

    return (
      <>
        {/* 배경색 레이어 - 셀 전체를 덮음 */}
        {bgColor !== 'transparent' && (
          <div
            className="leedeli-cal-bg-layer"
            style={{ background: bgColor }}
          />
        )}
        {/* pill 영역 */}
        <div className="leedeli-cal-cellContent" style={{ opacity: inRange ? 1 : 0.25 }}>
          <div className="leedeli-cal-pills">
            {otherPills.map((p) => (
              <Tag
                key={p.key}
                color={p.kind === 'half' ? 'orange' : 'blue'}
                style={{
                  marginInlineEnd: 0,
                  borderRadius: 999,
                  padding: '1px 8px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                }}
              >
                {p.text}
              </Tag>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <MobileShell
      title={editId ? '스케줄 수정' : '스케줄 생성'}
      right={
        <Space size={4}>
          <Button icon={<DownloadOutlined />} onClick={onExport}>
            내보내기
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={onSaveSchedule}>
            저장
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Card size="small" title="기본 설정">
          <Form.Item name="range" label="기간(시작~종료)" rules={[{ required: true, message: '기간을 선택하세요' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Card size="small" title="근무 규칙" style={{ marginTop: 12 }}>
          <Flex gap={8}>
            <Form.Item
              name={['workRules', 'DAILY_STAFF_BASE']}
              label="기본 인원"
              style={{ flex: 1, marginBottom: 0 }}
            >
              <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name={['workRules', 'DAILY_STAFF_MAX']}
              label="최대 인원"
              style={{ flex: 1, marginBottom: 0 }}
            >
              <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={8} style={{ marginTop: 10 }}>
            <Form.Item name={['workRules', 'WORK_HOURS']} label="근무시간" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name={['workRules', 'BREAK_HOURS']} label="휴게시간" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
        </Card>

        <Card
          size="small"
          title="직원 구성"
          style={{ marginTop: 12 }}
          extra={
            <Space size={6}>
              <Button
                onClick={() => {
                  setPresets(loadStaffPresets())
                  setPresetModalOpen(true)
                }}
              >
                저장/불러오기
              </Button>
            </Space>
          }
        >
          <Form.Item name="staffCount" label="인원 수" initialValue={staff.length || 1}>
            <InputNumber
              min={1}
              max={workRulesWatch.DAILY_STAFF_MAX}
              style={{ width: '100%' }}
              onChange={(n) => {
                const nextCount = Number(n ?? 1)
                const cur = (form.getFieldValue('staff') ?? []) as StaffMember[]
                let next = [...cur]
                if (next.length < nextCount) {
                  for (let i = next.length; i < nextCount; i++) {
                    next.push({
                      id: newId(),
                      name: '',
                      availableShifts: ['open', 'middle', 'close'],
                      priority: { open: 3, middle: 3, close: 3 },
                    })
                  }
                } else if (next.length > nextCount) {
                  next = next.slice(0, nextCount)
                }
                form.setFieldValue('staff', next)
                if (!selectedStaffId && next.length) setSelectedStaffId(next[0].id)
              }}
            />
          </Form.Item>

          <Form.List name="staff">
            {(fields) => (
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {fields.map((f, idx) => (
                  <Card key={f.key} size="small" title={`직원 ${idx + 1}`}>
                    <Form.Item
                      {...f}
                      name={[f.name, 'id']}
                      initialValue={(staff[idx] && staff[idx].id) || newId()}
                      hidden
                    >
                      <Input />
                    </Form.Item>

                    <Form.Item
                      {...f}
                      name={[f.name, 'name']}
                      label="이름"
                      rules={[{ required: true, message: '이름을 입력하세요' }]}
                    >
                      <Input placeholder="이름" />
                    </Form.Item>

                    <Form.Item {...f} name={[f.name, 'availableShifts']} label="가능 시프트">
                      <Checkbox.Group
                        options={[
                          { label: '오픈', value: 'open' },
                          { label: '미들', value: 'middle' },
                          { label: '마감', value: 'close' },
                        ]}
                      />
                    </Form.Item>

                    <Flex gap={8}>
                      <Form.Item {...f} name={[f.name, 'requiredShift']} label="필수" style={{ flex: 1 }}>
                        <Select
                          allowClear
                          options={[
                            { label: '오픈', value: 'open' },
                            { label: '미들', value: 'middle' },
                            { label: '마감', value: 'close' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item {...f} name={[f.name, 'preferredShift']} label="선호" style={{ flex: 1 }}>
                        <Select
                          allowClear
                          options={[
                            { label: '오픈', value: 'open' },
                            { label: '미들', value: 'middle' },
                            { label: '마감', value: 'close' },
                          ]}
                        />
                      </Form.Item>
                    </Flex>

                    <Collapse
                      size="small"
                      items={[
                        {
                          key: 'prio',
                          label: '우선순위(오픈/미들/마감)',
                          children: (
                            <Flex gap={8}>
                              <Form.Item {...f} name={[f.name, 'priority', 'open']} label="오픈" style={{ flex: 1 }}>
                                <InputNumber min={0} max={5} style={{ width: '100%' }} />
                              </Form.Item>
                              <Form.Item {...f} name={[f.name, 'priority', 'middle']} label="미들" style={{ flex: 1 }}>
                                <InputNumber min={0} max={5} style={{ width: '100%' }} />
                              </Form.Item>
                              <Form.Item {...f} name={[f.name, 'priority', 'close']} label="마감" style={{ flex: 1 }}>
                                <InputNumber min={0} max={5} style={{ width: '100%' }} />
                              </Form.Item>
                            </Flex>
                          ),
                        },
                      ]}
                    />
                  </Card>
                ))}
              </Space>
            )}
          </Form.List>
        </Card>
      </Form>

      <Card
        size="small"
        title="휴무/하프 요청"
        style={{ marginTop: 12 }}
        extra={<Button danger size="small" onClick={() => setRequests([])}>초기화</Button>}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Typography.Text type="secondary">
            직원 선택(1명) → 모드(휴무/하프) → 날짜 클릭 즉시 토글
          </Typography.Text>

          <Flex gap={8} wrap>
            {staff.slice(0, staffCount).map((s) => (
              <Button
                key={s.id}
                type={selectedStaffId === s.id ? 'primary' : 'default'}
                onClick={() => {
                  setSelectedStaffId(s.id)
                  // 선택한 직원의 preferredShift를 하프 시프트 기본값으로 설정
                  if (s.preferredShift) setHalfShift(s.preferredShift)
                }}
              >
                {s.name || '이름없음'}
              </Button>
            ))}
          </Flex>

          <Flex gap={8} wrap align="center">
            <Button
              type="default"
              className={`leedeli-mode-btn leedeli-mode-btn--off ${mode === 'off' ? 'is-active' : ''}`}
              onClick={() => setMode('off')}
            >
              휴무
            </Button>
            <Button
              type="default"
              className={`leedeli-mode-btn leedeli-mode-btn--half ${mode === 'half' ? 'is-active' : ''}`}
              onClick={() => setMode('half')}
            >
              하프
            </Button>
            {mode === 'half' ? (
              <Select
                value={halfShift}
                style={{ width: 100 }}
                options={[
                  { label: '오픈', value: 'open' },
                  { label: '미들', value: 'middle' },
                  { label: '마감', value: 'close' },
                ]}
                onChange={(v) => setHalfShift(v)}
              />
            ) : null}
          </Flex>

          <div
            onClickCapture={(e) => {
              // 셀 전체(td) 클릭을 위임으로 처리: 날짜 숫자 영역 클릭/재클릭에서도 토글이 항상 동작하게
              const el = e.target as HTMLElement | null
              const td = el?.closest?.('td.ant-picker-cell') as HTMLElement | null
              const iso = td?.getAttribute?.('title') ?? ''
              if (!iso) return

              if (!validDatesSet.has(iso)) {
                // 근무기간 밖 클릭: 경고만 띄우고, 캘린더의 어떤 동작도 발생하지 않게 차단
                e.preventDefault()
                e.stopPropagation()
                const now = Date.now()
                if (now - lastRangeWarnAtRef.current > 1200) {
                  lastRangeWarnAtRef.current = now
                  message.warning(`선택한 날짜(${iso})는 근무기간(${rangeISO.startDateISO} ~ ${rangeISO.endDateISO}) 밖입니다.`)
                }
                return
              }

              // 중복 토글 방지: antd 내부 onSelect 처리로 내려가지 않게 차단하고, 여기서만 처리
              e.preventDefault()
              e.stopPropagation()

              setSelectedDate(dayjs(iso))
              if (selectedStaffId) toggleForSelected(iso)
            }}
          >
            <Calendar
              fullscreen={false}
              value={selectedDate}
              onSelect={(d) => {
                // 선택 날짜 표시만(토글은 위임 핸들러에서만)
                setSelectedDate(d)
              }}
              cellRender={(d: Dayjs, info: CellRenderInfo<Dayjs>) => {
                if (info.type !== 'date') return info.originNode
                return <div className="leedeli-cal-cellWrap">{renderRequestPills(d)}</div>
              }}
            />
          </div>

          <Card size="small" title={`선택 날짜: ${selectedDate.format('YYYY-MM-DD')}`}>
            <Flex align="center" justify="space-between" wrap gap={8}>
              <Space>
                <Typography.Text>필요 인원</Typography.Text>
                <Tag color="blue">
                  {Number((workRulesWatch.DAILY_STAFF_BASE + requestForSelectedDate.needDelta).toFixed(2))}명
                </Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  (기본 {workRulesWatch.DAILY_STAFF_BASE} + Δ {requestForSelectedDate.needDelta})
                </Typography.Text>
              </Space>
              <Space>
                <Button
                  onClick={() => {
                    const base = workRulesWatch.DAILY_STAFF_BASE
                    const max = workRulesWatch.DAILY_STAFF_MAX
                    const maxDelta = Math.max(0, max - base)
                    const nextDelta = Math.max(0, Math.min(maxDelta, requestForSelectedDate.needDelta - 0.5))
                    updateRequest(requestForSelectedDate.dateISO, { needDelta: nextDelta })
                  }}
                  disabled={requestForSelectedDate.needDelta <= 0}
                >
                  -0.5
                </Button>
                <Button
                  type="primary"
                  onClick={() => {
                    const base = workRulesWatch.DAILY_STAFF_BASE
                    const max = workRulesWatch.DAILY_STAFF_MAX
                    const maxDelta = Math.max(0, max - base)
                    const nextDelta = Math.max(0, Math.min(maxDelta, requestForSelectedDate.needDelta + 0.5))
                    updateRequest(requestForSelectedDate.dateISO, { needDelta: nextDelta })
                  }}
                  disabled={workRulesWatch.DAILY_STAFF_BASE + requestForSelectedDate.needDelta >= workRulesWatch.DAILY_STAFF_MAX}
                >
                  +0.5
                </Button>
              </Space>
            </Flex>
          </Card>
        </Space>
      </Card>

      <Flex gap={8} style={{ marginTop: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={onGenerate} block>
          스케줄 생성
        </Button>
      </Flex>

      {result ? (
        <Card size="small" title="생성 결과" style={{ marginTop: 12 }}>
          <Alert
            type="info"
            showIcon
            message="MVP 생성 로직입니다. 다음 단계에서 검증/공정성/시프트 분배를 더 정교하게 다듬습니다."
            style={{ marginBottom: 12 }}
          />

          <Typography.Title level={5}>인원별 통계</Typography.Title>
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {result.stats
              .slice()
              .sort((a, b) => b.workUnits - a.workUnits)
              .map((st) => (
                <Card key={st.staffId} size="small">
                  <Flex justify="space-between">
                    <Typography.Text strong>{st.name}</Typography.Text>
                    <Typography.Text type="secondary">근무환산 {st.workUnits}</Typography.Text>
                  </Flex>
                  <Typography.Text type="secondary">
                    풀 {st.fullDays} · 하프 {st.halfDays} · 휴무 {st.offDays}
                  </Typography.Text>
                </Card>
              ))}
          </Space>

          <Typography.Title level={5} style={{ marginTop: 12 }}>
            일자별 배정
          </Typography.Title>
          <Calendar
            fullscreen={false}
            value={selectedDate}
            cellRender={(d: Dayjs, info: CellRenderInfo<Dayjs>) => {
              if (info.type !== 'date') return info.originNode

              const iso = d.format('YYYY-MM-DD')
              const assignment = result.assignments.find((a) => a.dateISO === iso)
              if (!assignment) return null

              const inRange = validDatesSet.has(iso)

              const shiftColors: Record<Shift, string> = { open: '#52c41a', middle: '#1890ff', close: '#722ed1' }
              const shiftLabels: Record<Shift, string> = { open: '오', middle: '미', close: '마' }

              return (
                <div className="leedeli-cal-cellContent" style={{ opacity: inRange ? 1 : 0.25 }}>
                  <div className="leedeli-cal-pills" style={{ fontSize: 9 }}>
                    {(['open', 'middle', 'close'] as Shift[]).map((shift) => {
                      const names = assignment.byShift[shift]
                        .map((x) => staff.find((s) => s.id === x.staffId)?.name || '?')
                        .join(',')
                      if (!names) return null
                      return (
                        <Tag
                          key={shift}
                          color={shiftColors[shift]}
                          style={{ marginInlineEnd: 0, borderRadius: 4, padding: '0 3px', fontSize: 9, lineHeight: '14px' }}
                        >
                          {shiftLabels[shift]}:{names}
                        </Tag>
                      )
                    })}
                  </div>
                </div>
              )
            }}
          />
        </Card>
      ) : null}

      <Modal
        open={presetModalOpen}
        title="직원 구성 저장/불러오기"
        onCancel={() => setPresetModalOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Card size="small" title="저장">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="구성 이름" />
              <Button
                type="primary"
                onClick={() => {
                  const staff = (form.getFieldValue('staff') ?? []) as StaffMember[]
                  const name = presetName.trim()
                  if (!name) {
                    message.error('이름을 입력하세요.')
                    return
                  }
                  const preset: StaffPreset = { id: newId(), name, staff, updatedAtISO: new Date().toISOString() }
                  upsertStaffPreset(preset)
                  setPresets(loadStaffPresets())
                  setPresetName('')
                  message.success('저장 완료')
                }}
                block
              >
                저장
              </Button>
            </Space>
          </Card>

          <Card size="small" title="불러오기">
            <Select
              style={{ width: '100%' }}
              placeholder="저장된 구성 선택"
              options={presets.map((p) => ({ value: p.id, label: `${p.name} (${p.staff.length}명)` }))}
              onChange={(id) => {
                const p = presets.find((x) => x.id === id)
                if (!p) return
                form.setFieldValue('staffCount', p.staff.length)
                form.setFieldValue('staff', p.staff)
                setSelectedStaffId(p.staff[0]?.id ?? null)
                message.success('불러오기 완료')
                setPresetModalOpen(false)
              }}
            />
          </Card>

          <Alert
            type="warning"
            showIcon
            message="현재는 구성 삭제/편집은 다음 단계에서 추가합니다."
          />
        </Space>
      </Modal>
    </MobileShell>
  )
}


