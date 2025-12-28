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
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DayRequest, SavedSchedule, Shift, StaffMember, WorkRules } from '../domain/types'
import { generateSchedule, toSavedSchedule, validateGeneratedSchedule, validateScheduleInputs } from '../domain/scheduleEngine'
import type { ScheduleInputs } from '../domain/scheduleEngine'
import { MobileShell } from '../layouts/MobileShell'
import { getSchedule, upsertSchedule } from '../storage/schedulesRepo'
import { loadStaffPresets, upsertStaffPreset } from '../storage/staffPresetsRepo'
import type { StaffPreset } from '../storage/staffPresetsRepo'
import { DEFAULT_WORK_RULES, loadWorkRules, saveWorkRules } from '../storage/workRulesRepo'
import { daysInMonthISO } from '../utils/date'
import { newId } from '../utils/id'
import { exportScheduleXlsx } from '../utils/scheduleExport'

export function CreateSchedulePage() {
  const { token } = theme.useToken()
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

  const normalizeRequest = (r: Partial<DayRequest> & { dateISO: string }): DayRequest => {
    const base: DayRequest = {
      dateISO: r.dateISO,
      offStaffIds: (r.offStaffIds ?? []) as string[],
      halfStaff: (r.halfStaff ?? []) as Array<{ staffId: string; shift: Shift }>,
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
    let year = dayjs().year()
    let month = dayjs().month() + 1
    let staff: StaffMember[] = []
    let loadedRequests: DayRequest[] = []

    if (editId) {
      const s = getSchedule(editId)
      if (s) {
        year = s.year
        month = s.month
        staff = s.staff
        loadedRequests = (s.requests ?? []).map((r) => normalizeRequest(r))
        setResult({ assignments: s.assignments, stats: s.stats })
      }
    }

    if (!staff.length) {
      staff = [
        {
          id: newId(),
          name: '',
          availableShifts: ['open', 'middle', 'close'],
          priority: { open: 3, middle: 3, close: 3 },
        },
      ]
    }

    setRequests(loadedRequests.map((r) => normalizeRequest(r)))
    form.setFieldsValue({
      ym: dayjs(`${year}-${String(month).padStart(2, '0')}-01`),
      workRules,
      staffCount: staff.length,
      staff,
    })
    setSelectedDate(dayjs(`${year}-${String(month).padStart(2, '0')}-01`))
    setSelectedStaffId(staff[0]?.id ?? null)
  }, [editId, form])

  const getInput = (): ScheduleInputs => {
    const v = form.getFieldsValue(true) as {
      ym: Dayjs
      workRules: WorkRules
      staff: StaffMember[]
    }
    const ym = v.ym ?? dayjs()
    const year = ym.year()
    const month = ym.month() + 1
    const workRules = v.workRules ?? DEFAULT_WORK_RULES
    const staff = (v.staff ?? []).map((s) => ({
      ...s,
      name: (s.name ?? '').toString(),
      availableShifts: s.availableShifts ?? [],
      priority: s.priority ?? { open: 3, middle: 3, close: 3 },
    }))
    return { year, month, workRules, staff, requests }
  }

  const currentYm = () => {
    const ym = (form.getFieldValue('ym') as Dayjs) ?? dayjs()
    return { year: ym.year(), month: ym.month() + 1 }
  }

  const ensureRequest = (dateISO: string) => {
    setRequests((prev) => {
      const idx = prev.findIndex((x) => x.dateISO === dateISO)
      if (idx >= 0) return prev
      return [...prev, normalizeRequest({ dateISO })]
    })
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
    ensureRequest(dateISO)
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
        const hitIdx = next.halfStaff.findIndex((x) => x.staffId === sid)
        if (hitIdx >= 0) next.halfStaff.splice(hitIdx, 1) // 이미 하프면 해제
        else next.halfStaff.push({ staffId: sid, shift: halfShift })
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
      year: input.year,
      month: input.month,
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

  const staff: StaffMember[] = Form.useWatch('staff', form) ?? []
  const staffCount: number = Form.useWatch('staffCount', form) ?? staff.length ?? 0
  const ymWatch: Dayjs = Form.useWatch('ym', form) ?? dayjs()
  const workRulesWatch: WorkRules = Form.useWatch('workRules', form) ?? DEFAULT_WORK_RULES

  useEffect(() => {
    // 연/월 변경 시 캘린더 선택 날짜를 해당 월 1일로 정렬
    const next = dayjs(`${ymWatch.year()}-${String(ymWatch.month() + 1).padStart(2, '0')}-01`)
    if (!selectedDate.isSame(next, 'month')) setSelectedDate(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymWatch])

  const requestForSelectedDate = useMemo(() => {
    const iso = selectedDate.format('YYYY-MM-DD')
    const found = requests.find((r) => r.dateISO === iso)
    return found ? normalizeRequest(found) : normalizeRequest({ dateISO: iso })
  }, [requests, selectedDate])

  const cellRender = (d: Dayjs) => {
    const iso = d.format('YYYY-MM-DD')
    const r0 = requests.find((x) => x.dateISO === iso)
    const r = r0 ? normalizeRequest(r0) : null
    if (!r) return null

    // 선택 직원(단일) 기준 하이라이트
    const sid = selectedStaffId
    const off = sid ? r.offStaffIds.includes(sid) : false
    const half = sid ? r.halfStaff.some((x) => x.staffId === sid) : false

    const blue = token.colorPrimaryBg // 파랑 계열
    const orange = token.colorWarningBg // 주황 계열
    const bg =
      off && half ? `linear-gradient(90deg, ${blue} 0 50%, ${orange} 50% 100%)` : off ? blue : half ? orange : undefined

    const deltaTag = r.needDelta > 0 ? `+${r.needDelta}` : null

    return (
      <div style={{ padding: 2, borderRadius: 8, background: bg }}>
        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
          {off ? '휴무' : null}
          {off && half ? ' / ' : null}
          {half ? '하프' : null}
          {deltaTag ? ` · ${deltaTag}` : null}
        </div>
      </div>
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
          <Form.Item name="ym" label="연/월" rules={[{ required: true, message: '연/월을 선택하세요' }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
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
              max={20}
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

      <Card size="small" title="휴무/하프 요청" style={{ marginTop: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Typography.Text type="secondary">
            직원 선택(1명) → 모드(휴무/하프) → 날짜 클릭 즉시 토글
          </Typography.Text>

          <Flex gap={8} wrap>
            {staff.slice(0, staffCount).map((s) => (
              <Button
                key={s.id}
                type={selectedStaffId === s.id ? 'primary' : 'default'}
                onClick={() => setSelectedStaffId(s.id)}
              >
                {s.name || '이름없음'}
              </Button>
            ))}
          </Flex>

          <Flex gap={8} wrap align="center">
            <Select
              value={mode}
              style={{ width: 120 }}
              options={[
                { label: '휴무', value: 'off' },
                { label: '하프', value: 'half' },
              ]}
              onChange={(v) => setMode(v)}
            />
            {mode === 'half' ? (
              <Select
                value={halfShift}
                style={{ width: 120 }}
                options={[
                  { label: '오픈', value: 'open' },
                  { label: '미들', value: 'middle' },
                  { label: '마감', value: 'close' },
                ]}
                onChange={(v) => setHalfShift(v)}
              />
            ) : null}
          </Flex>

          <Calendar
            fullscreen={false}
            value={selectedDate}
            onSelect={(d) => {
              setSelectedDate(d)
              const iso = d.format('YYYY-MM-DD')
              const { year, month } = currentYm()
              const validDates = new Set(daysInMonthISO(year, month))
              if (validDates.has(iso)) {
                toggleForSelected(iso)
              }
            }}
            cellRender={(d) => <div>{cellRender(d)}</div>}
          />

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
          <Collapse
            size="small"
            items={result.assignments.map((a) => ({
              key: a.dateISO,
              label: a.dateISO,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {(['open', 'middle', 'close'] as Shift[]).map((shift) => (
                    <Flex key={shift} justify="space-between">
                      <Typography.Text strong>
                        {shift === 'open' ? '오픈' : shift === 'middle' ? '미들' : '마감'}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {a.byShift[shift]
                          .map((x) => {
                            const nm = staff.find((s) => s.id === x.staffId)?.name ?? x.staffId
                            return `${nm}(${x.unit})`
                          })
                          .join(' / ') || '-'}
                      </Typography.Text>
                    </Flex>
                  ))}
                </Space>
              ),
            }))}
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


