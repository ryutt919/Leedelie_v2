import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { CsvPreviewModal } from '../components/CsvPreviewModal'
import type { CsvPreviewRow } from '../components/CsvPreviewModal'
import type { Ingredient, Prep, PrepIngredientItem } from '../domain/types'
import { MobileShell } from '../layouts/MobileShell'
import { loadIngredients, saveIngredients } from '../storage/ingredientsRepo'
import { clearPreps, deletePrep, loadPreps, savePreps, upsertPrep } from '../storage/prepsRepo'
import { downloadText } from '../utils/download'
import { newId } from '../utils/id'
import { round2, safeNumber } from '../utils/money'
import { normalizeUnitLabel, parseAmountAndUnit } from '../utils/unit'
import { downloadXlsx } from '../utils/xlsxExport'
import { parseXlsxFileToAOA } from '../utils/xlsxImport'

export function PrepsPage() {
  const [tick, setTick] = useState(0)
  const ingredients = useMemo(
    () => {
      void tick
      return loadIngredients().sort((a, b) => a.name.localeCompare(b.name))
    },
    [tick],
  )
  const preps = useMemo(() => {
    void tick
    return loadPreps().sort((a, b) => a.name.localeCompare(b.name))
  }, [tick])

  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState<Prep | null>(null)
  const [form] = Form.useForm()
  const [restockPicker, setRestockPicker] = useState<dayjs.Dayjs | null>(null)

  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvPreviewRow<{ prep: Prep; changedIngredients: Ingredient[] }>[]>([])

  const refresh = () => setTick((x) => x + 1)

  const ingredientById = useMemo(() => new Map(ingredients.map((x) => [x.id, x])), [ingredients])
  const unitLabelOf = (ingredientId: string) => {
    const ing = ingredientById.get(ingredientId)
    return ing?.unitLabel ?? (ing?.unitType === 'ea' ? '개' : 'g')
  }

  const calcCostFromFormItems = (items: PrepIngredientItem[]) => {
    let sum = 0
    for (const it of items) {
      if (!it?.ingredientId || !Number.isFinite(it.amount) || it.amount <= 0) continue
      const ing = ingredientById.get(it.ingredientId)
      const unitPrice = ing?.unitPrice ?? 0
      sum += unitPrice * it.amount
    }
    return round2(sum)
  }

  const calcPrepCost = (p: Prep) => {
    let sum = 0
    for (const it of p.items) {
      const ing = ingredientById.get(it.ingredientId)
      const unitPrice = ing?.unitPrice ?? 0
      sum += unitPrice * it.amount
    }
    return round2(sum)
  }

  const avgIntervalDays = (restockDatesISO: string[]) => {
    const dates = [...restockDatesISO]
      .map((d) => dayjs(d))
      .filter((d) => d.isValid())
      .sort((a, b) => a.valueOf() - b.valueOf())
    if (dates.length < 2) return null
    let total = 0
    for (let i = 1; i < dates.length; i++) total += dates[i].diff(dates[i - 1], 'day')
    return Math.round(total / (dates.length - 1))
  }

  const nextRestockISO = (restockDatesISO: string[]) => {
    const avg = avgIntervalDays(restockDatesISO)
    if (!avg) return null
    const last = restockDatesISO
      .map((d) => dayjs(d))
      .filter((d) => d.isValid())
      .sort((a, b) => b.valueOf() - a.valueOf())[0]
    if (!last) return null
    return last.add(avg, 'day').format('YYYY-MM-DD')
  }

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ name: '', items: [], restockDatesISO: [] })
    setOpenEdit(true)
  }

  const openUpdate = (p: Prep) => {
    setEditing(p)
    form.setFieldsValue({
      name: p.name,
      items: p.items.map((x) => ({ ...x })),
      restockDatesISO: p.restockDatesISO,
    })
    setOpenEdit(true)
  }

  const addTodayRestockFor = (p: Prep) => {
    const today = dayjs().format('YYYY-MM-DD')
    const nextDates = [...new Set([...(p.restockDatesISO ?? []), today])].sort()
    const now = new Date().toISOString()
    const next: Prep = { ...p, restockDatesISO: nextDates, updatedAtISO: now }
    upsertPrep(next)
    refresh()
    message.success(`${p.name}: 오늘(${today}) 보충 이력을 추가했습니다.`)
  }

  const onSave = async () => {
    const v = await form.validateFields()
    const name = String(v.name ?? '').trim()
    const items = (v.items ?? []) as PrepIngredientItem[]
    const restockDatesISO = (v.restockDatesISO ?? []) as string[]
    const now = new Date().toISOString()

    const normalizedItems = items
      .filter((x) => x && x.ingredientId && x.amount > 0)
      .map((x) => ({
        ingredientId: x.ingredientId,
        ingredientName: x.ingredientName || (ingredientById.get(x.ingredientId)?.name ?? ''),
        amount: safeNumber(x.amount, 0),
      }))

    const next: Prep = editing
      ? { ...editing, name, items: normalizedItems, restockDatesISO, updatedAtISO: now }
      : { id: newId(), name, items: normalizedItems, restockDatesISO, updatedAtISO: now }

    upsertPrep(next)
    setOpenEdit(false)
    refresh()
  }

  const onExportCsv = () => {
    const header = '이름,재료명,투입량,보충날짜'
    const lines: string[] = []
    for (const p of preps) {
      const dates = [...p.restockDatesISO].sort()
      for (const it of p.items) {
        lines.push([p.name, it.ingredientName, it.amount, ...dates].join(','))
      }
      if (p.items.length === 0) {
        lines.push([p.name, '', '', ...dates].join(','))
      }
    }
    const csv = '\ufeff' + [header, ...lines].join('\n')
    downloadText('preps.csv', csv, 'text/csv;charset=utf-8')
  }

  const onExportXlsx = () => {
    const rows: Record<string, unknown>[] = []
    for (const p of preps) {
      const cost = calcPrepCost(p)
      const avg = avgIntervalDays(p.restockDatesISO)
      const next = nextRestockISO(p.restockDatesISO)
      for (const it of p.items.length ? p.items : [{ ingredientId: '', ingredientName: '', amount: 0 }]) {
        const unitLabel = it.ingredientId ? unitLabelOf(it.ingredientId) : ''
        rows.push({
          프렙명: p.name,
          재료명: it.ingredientName,
          투입량: unitLabel ? `${it.amount}${unitLabel}` : it.amount,
          총비용: cost,
          평균보충간격일: avg ?? '',
          다음보충예상일: next ?? '',
          보충이력: [...p.restockDatesISO].sort().join(', '),
        })
      }
    }
    downloadXlsx('preps.xlsx', 'Preps', rows)
  }

  const ensureIngredientByName = (name: string, unitLabel?: string) => {
    const key = name.toLowerCase()
    const existing = ingredients.find((x) => x.name.toLowerCase() === key)
    const normalizedUnitLabel = normalizeUnitLabel(unitLabel) || ''
    if (existing) {
      // 엑셀에서 단위가 들어오면, 기존 재료 단위가 없거나 다르면 업데이트 대상으로 포함
      if (normalizedUnitLabel && (existing.unitLabel ?? (existing.unitType === 'ea' ? '개' : 'g')) !== normalizedUnitLabel) {
        const now = new Date().toISOString()
        const updated: Ingredient = { ...existing, unitLabel: normalizedUnitLabel, updatedAtISO: now }
        return { ingredient: updated, changed: updated }
      }
      return { ingredient: existing, changed: null as Ingredient | null }
    }
    const now = new Date().toISOString()
    const created: Ingredient = {
      id: newId(),
      name,
      purchasePrice: 0,
      purchaseUnit: 1,
      unitPrice: 0,
      unitLabel: normalizedUnitLabel || 'g',
      updatedAtISO: now,
    }
    return { ingredient: created, changed: created }
  }

  const buildXlsxPreview = async (file: File) => {
    const aoa = await parseXlsxFileToAOA(file, { preferredSheetName: 'Preps' })

    if (aoa.length < 2) {
      const header = aoa[0] ?? []
      message.error(`엑셀 내용을 인식하지 못했습니다. (행 수=${aoa.length}, 헤더=${JSON.stringify(header).slice(0, 80)})`)
      return
    }
    const dataRows = aoa.slice(1) // 1행(헤더) 무시

    // XLSX(내보내기) 포맷 기준:
    // 프렙명, 재료명, 투입량, 보충이력(콤마 구분)
    // 같은 프렙명 병합(재료 누적)
    const prepMap = new Map<
      string,
      { name: string; items: PrepIngredientItem[]; dates: string[]; changedIngredients: Ingredient[]; errors: string[] }
    >()
    const changedIngredients: Ingredient[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = Array.isArray(dataRows[i]) ? (dataRows[i] as unknown[]) : []
      const prepNameRaw = String(row[0] ?? '') // A: 프렙명/소스명
      const ingNameRaw = String(row[1] ?? '') // B: 재료명
      const amountRaw = row[2] // C: 투입량
      const historyRaw = String(row[3] ?? '') // D: 보충이력(옵션)

      const prepName = prepNameRaw.trim()
      const ingName = ingNameRaw.trim()
      const parsedAmount = parseAmountAndUnit(amountRaw)
      const amount = Number.isFinite(parsedAmount.amount) ? parsedAmount.amount : safeNumber(amountRaw, NaN)
      const unitLabel = parsedAmount.unitLabel // 없으면 '' (단위 업데이트 안 함)
      const dates = historyRaw
        .replace(/_x000d_/gi, '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)

      const errors: string[] = []
      if (!prepName) errors.push(`(${i + 1}행) 프렙명이 비었습니다.`)
      if (!ingName) errors.push(`(${i + 1}행) 재료명이 비었습니다.`)
      if (!Number.isFinite(amount) || amount <= 0) errors.push(`(${i + 1}행) 투입량이 올바르지 않습니다.`)
      for (const d of dates) {
        if (!dayjs(d).isValid()) errors.push(`(${i + 1}행) 보충날짜 형식이 올바르지 않습니다: ${d}`)
      }

      if (!prepName) continue

      let bucket = prepMap.get(prepName.toLowerCase())
      if (!bucket) {
        bucket = { name: prepName, items: [], dates: [], changedIngredients: [], errors: [] }
        prepMap.set(prepName.toLowerCase(), bucket)
      }
      bucket.errors.push(...errors)
      bucket.dates.push(...dates)

      if (ingName && Number.isFinite(amount) && amount > 0) {
        const ensured = ensureIngredientByName(ingName, unitLabel)
        if (ensured.changed) {
          changedIngredients.push(ensured.changed)
          bucket.changedIngredients.push(ensured.changed)
        }
        const existingItem = bucket.items.find((x) => x.ingredientId === ensured.ingredient.id)
        if (existingItem) existingItem.amount = round2(existingItem.amount + amount)
        else bucket.items.push({ ingredientId: ensured.ingredient.id, ingredientName: ensured.ingredient.name, amount })
      }
    }

    const existingByName = new Map(preps.map((p) => [p.name.toLowerCase(), p]))

    const rows: CsvPreviewRow<{ prep: Prep; changedIngredients: Ingredient[] }>[] = [...prepMap.values()].map((b, idx) => {
      const uniqDates = [...new Set(b.dates)].filter((d) => dayjs(d).isValid()).sort()
      const existing = existingByName.get(b.name.toLowerCase())
      const now = new Date().toISOString()
      const prep: Prep = existing
        ? { ...existing, name: b.name, items: b.items, restockDatesISO: [...new Set([...(existing.restockDatesISO ?? []), ...uniqDates])], updatedAtISO: now }
        : { id: newId(), name: b.name, items: b.items, restockDatesISO: uniqDates, updatedAtISO: now }

      const kind: CsvPreviewRow<{ prep: Prep; createdIngredients: Ingredient[] }>['kind'] =
        b.errors.length ? 'invalid' : existing ? 'update' : 'create'

      const ingNames = [...new Set(b.items.map((x) => x.ingredientName).map((s) => String(s ?? '').trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      )
      const ingLabel = ingNames.join(', ')

      return {
        key: `prep_${idx}_${b.name}`,
        rowNo: idx + 1,
        parsed: { prep, changedIngredients: b.changedIngredients },
        parsedLabel: (
          <Space direction="vertical" size={0}>
            <Typography.Text>{b.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              재료 {b.items.length}개 / 보충 {uniqDates.length}회
            </Typography.Text>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 11,
                display: 'block',
                maxWidth: 360, // 칸 넓이 유지(가로 확장 방지)
                whiteSpace: 'normal', // 길이에 따라 줄바꿈, 높이(y축) 확장
                overflowWrap: 'anywhere',
                lineHeight: 1.25,
              }}
            >
              재료: {ingLabel || '-'}
            </Typography.Text>
          </Space>
        ),
        existingLabel: existing ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{existing.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              재료 {existing.items.length}개 / 보충 {existing.restockDatesISO.length}회
            </Typography.Text>
          </Space>
        ) : undefined,
        kind,
        errors: b.errors,
        action: kind === 'invalid' ? 'skip' : 'upsert',
      }
    })

    // “없는 재료명은 자동 생성(가격 0)”을 실제 apply 때 반영하기 위해 rows에 포함
    setCsvRows(rows)
    setCsvOpen(true)
    if (changedIngredients.length) {
      const createdCount = changedIngredients.filter((x) => !ingredients.find((i) => i.id === x.id)).length
      const updatedCount = changedIngredients.length - createdCount
      if (createdCount) message.info(`엑셀에 없는 재료 ${createdCount}개는 가격 0으로 생성 예정입니다.`)
      if (updatedCount) message.info(`재료 단위 업데이트 ${updatedCount}건이 적용 예정입니다.`)
    }
  }

  const applyCsv = () => {
    const nextPreps = [...preps]
    const prepByName = new Map(nextPreps.map((p) => [p.name.toLowerCase(), p]))
    const nextIngredients = [...ingredients]
    const ingByName = new Map(nextIngredients.map((i) => [i.name.toLowerCase(), i]))

    let createdP = 0
    let updatedP = 0
    let createdI = 0
    let updatedI = 0
    let skipped = 0

    for (const r of csvRows) {
      if (r.kind === 'invalid' || r.action === 'skip') {
        skipped++
        continue
      }

      // 재료 생성/업데이트(단위 포함) 반영
      for (const ci of r.parsed.changedIngredients) {
        const key = ci.name.toLowerCase()
        const existing = ingByName.get(key)
        if (!existing) {
          nextIngredients.push(ci)
          ingByName.set(key, ci)
          createdI++
        } else {
          const idx = nextIngredients.findIndex((x) => x.id === existing.id)
          const merged: Ingredient = { ...existing, ...ci, id: existing.id }
          if (idx >= 0) nextIngredients[idx] = merged
          ingByName.set(key, merged)
          updatedI++
        }
      }

      const prep = r.parsed.prep
      const key = prep.name.toLowerCase()
      const existing = prepByName.get(key)
      if (existing) {
        const idx = nextPreps.findIndex((p) => p.id === existing.id)
        if (idx >= 0) nextPreps[idx] = prep
        prepByName.set(key, prep)
        updatedP++
      } else {
        nextPreps.push(prep)
        prepByName.set(key, prep)
        createdP++
      }
    }

    saveIngredients(nextIngredients)
    savePreps(nextPreps)
    setCsvOpen(false)
    refresh()
    message.success(
      `적용 완료: 프렙 생성 ${createdP}, 갱신 ${updatedP}, 재료 생성 ${createdI}, 재료 단위/정보 갱신 ${updatedI}, 스킵 ${skipped}`,
    )
  }

  return (
    <MobileShell
      title="프렙/소스 관리"
      right={
        <Space size={4}>
          <Button icon={<DownloadOutlined />} onClick={onExportXlsx}>
            XLSX
          </Button>
          <Button onClick={onExportCsv}>CSV</Button>
        </Space>
      }
    >
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          추가
        </Button>
        <Upload
          accept=".xls,.xlsx"
          showUploadList={false}
          beforeUpload={async (file) => {
            await buildXlsxPreview(file)
            return false
          }}
        >
          <Button icon={<UploadOutlined />}>엑셀 업로드</Button>
        </Upload>
        <Popconfirm
          title="프렙 전체를 초기화할까요?"
          okText="초기화"
          cancelText="취소"
          onConfirm={() => {
            clearPreps()
            refresh()
          }}
        >
          <Button danger icon={<ReloadOutlined />}>
            전체 초기화
          </Button>
        </Popconfirm>
      </Flex>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        업로드 엑셀 형식: 시트명 <b>Preps</b>(없으면 첫 시트) / 헤더 <b>프렙명</b>, <b>재료명</b>, <b>투입량</b>, <b>보충이력</b>(예:
        2025-12-01, 2025-12-15)
      </Typography.Text>

      <Card size="small">
        <List
          dataSource={preps}
          locale={{ emptyText: '프렙이 없습니다. “추가” 또는 엑셀 업로드를 사용하세요.' }}
          renderItem={(p) => {
            const avg = avgIntervalDays(p.restockDatesISO)
            const next = nextRestockISO(p.restockDatesISO)
            return (
              <List.Item
                actions={[
                  <Button key="today" type="link" onClick={() => addTodayRestockFor(p)}>
                    오늘 추가
                  </Button>,
                  <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openUpdate(p)}>
                    수정
                  </Button>,
                  <Popconfirm
                    key="del"
                    title="삭제할까요?"
                    okText="삭제"
                    cancelText="취소"
                    onConfirm={() => {
                      deletePrep(p.id)
                      refresh()
                    }}
                  >
                    <Button danger type="link" icon={<DeleteOutlined />}>
                      삭제
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={p.name}
                  description={
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">
                        평균 보충 {avg ? `${avg}일` : '-'} · 다음 예상 {next ?? '-'}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Card>

      <Modal
        open={openEdit}
        title={editing ? '프렙 수정' : '프렙 추가'}
        onCancel={() => setOpenEdit(false)}
        onOk={onSave}
        okText="저장"
        width={720}
      >
        <Form form={form} layout="vertical" initialValues={{ items: [], restockDatesISO: [] }}>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const items = (form.getFieldValue('items') ?? []) as PrepIngredientItem[]
              const normalized = items.filter((x) => x?.ingredientId)
              const cost = calcCostFromFormItems(items)
              return (
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  재료 {normalized.length}개 · 총비용 {cost}
                </Typography.Text>
              )
            }}
          </Form.Item>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="예) 토마토 소스" />
          </Form.Item>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Card size="small" title="재료 목록" extra={<Button onClick={() => add()}>추가</Button>}>
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  {fields.map((f) => (
                    <Flex key={f.key} gap={8} align="start">
                      <Form.Item
                        {...f}
                        name={[f.name, 'ingredientId']}
                        label="재료"
                        rules={[{ required: true, message: '재료 선택' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Select
                          showSearch
                          placeholder="재료 선택"
                          optionFilterProp="label"
                          options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
                          onChange={(id) => {
                            const ing = ingredientById.get(id)
                            form.setFieldValue(['items', f.name, 'ingredientName'], ing?.name ?? '')
                          }}
                        />
                      </Form.Item>
                      <Form.Item label="투입량" style={{ width: 180, marginBottom: 0 }}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Form.Item {...f} name={[f.name, 'amount']} rules={[{ required: true, message: '투입량' }]} noStyle>
                            <InputNumber min={0} style={{ width: 120 }} />
                          </Form.Item>
                          <Form.Item
                            shouldUpdate={(prev, cur) =>
                              (prev.items?.[f.name]?.ingredientId ?? '') !== (cur.items?.[f.name]?.ingredientId ?? '')
                            }
                            noStyle
                          >
                            {() => {
                              const id = String(form.getFieldValue(['items', f.name, 'ingredientId']) ?? '')
                              return (
                                <Button disabled style={{ width: 60 }}>
                                  {id ? unitLabelOf(id) : '-'}
                                </Button>
                              )
                            }}
                          </Form.Item>
                        </Space.Compact>
                      </Form.Item>
                      <Button danger type="text" onClick={() => remove(f.name)} aria-label="삭제">
                        삭제
                      </Button>

                      <Form.Item {...f} name={[f.name, 'ingredientName']} hidden>
                        <Input />
                      </Form.Item>
                    </Flex>
                  ))}
                </Space>
              </Card>
            )}
          </Form.List>

          <Form.Item label="보충 이력">
            <Space wrap>
              <DatePicker
                value={restockPicker}
                onChange={(d) => {
                  if (!d) return
                  const cur = (form.getFieldValue('restockDatesISO') ?? []) as string[]
                  const iso = d.format('YYYY-MM-DD')
                  form.setFieldValue('restockDatesISO', [...new Set([iso, ...cur])].sort())
                  setRestockPicker(null) // 선택 즉시 목록 반영 + 입력 초기화
                }}
              />
            </Space>
            <Form.Item name="restockDatesISO" noStyle>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item shouldUpdate noStyle>
              {() => {
                const dates = ((form.getFieldValue('restockDatesISO') ?? []) as string[])
                  .filter((x) => dayjs(x, 'YYYY-MM-DD', true).isValid())
                  .sort()
                if (!dates.length) {
                  return (
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                      보충 이력이 없습니다.
                    </Typography.Text>
                  )
                }
                return (
                  <div style={{ marginTop: 8 }}>
                    <Space wrap size={4}>
                      {dates.map((d) => (
                        <Tag
                          key={d}
                          closable
                          onClose={(e) => {
                            e.preventDefault()
                            const next = dates.filter((x) => x !== d)
                            form.setFieldValue('restockDatesISO', next)
                          }}
                        >
                          {d}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )
              }}
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>

      <CsvPreviewModal
        open={csvOpen}
        title="엑셀 미리보기 (프렙)"
        rows={csvRows}
        onClose={() => setCsvOpen(false)}
        onChangeRowAction={(key, action) =>
          setCsvRows((prev) => prev.map((r) => (r.key === key ? { ...r, action } : r)))
        }
        onBulkAction={(action) =>
          setCsvRows((prev) => prev.map((r) => (r.kind === 'invalid' ? r : { ...r, action })))
        }
        onApply={applyCsv}
      />
    </MobileShell>
  )
}


