import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Form, Input, InputNumber, List, Modal, Popconfirm, Select, Space, Typography, Upload, message } from 'antd'
import { useMemo, useState } from 'react'
import { CsvPreviewModal } from '../components/CsvPreviewModal'
import type { CsvPreviewRow } from '../components/CsvPreviewModal'
import type { Ingredient } from '../domain/types'
import { MobileShell } from '../layouts/MobileShell'
import { clearIngredients, deleteIngredient, loadIngredients, saveIngredients, upsertIngredient } from '../storage/ingredientsRepo'
import { downloadText } from '../utils/download'
import { newId } from '../utils/id'
import { round2, safeNumber } from '../utils/money'
import { normalizeUnitLabel, parseAmountAndUnit } from '../utils/unit'
import { downloadXlsx } from '../utils/xlsxExport'
import { parseXlsxFileToAOA } from '../utils/xlsxImport'

export function IngredientsPage() {
  const [tick, setTick] = useState(0)
  const items = useMemo(() => {
    void tick
    return loadIngredients().sort((a, b) => a.name.localeCompare(b.name))
  }, [tick])

  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form] = Form.useForm()

  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvPreviewRow<{ name: string; price: number; unit: number; unitLabel: string }>[]>([])

  const refresh = () => setTick((x) => x + 1)

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ name: '', purchasePrice: 0, purchaseUnit: 1, unitLabel: 'g' })
    setOpenEdit(true)
  }

  const openUpdate = (it: Ingredient) => {
    setEditing(it)
    form.setFieldsValue({
      name: it.name,
      purchasePrice: it.purchasePrice,
      purchaseUnit: it.purchaseUnit,
      unitLabel: it.unitLabel ?? (it.unitType === 'ea' ? '개' : 'g'),
    })
    setOpenEdit(true)
  }

  const onSave = async () => {
    const v = await form.validateFields()
    const name = String(v.name ?? '').trim()
    const purchasePrice = safeNumber(v.purchasePrice, 0)
    const purchaseUnit = safeNumber(v.purchaseUnit, 1)
    const unitLabel = normalizeUnitLabel(v.unitLabel) || 'g'
    if (!name) return
    if (purchaseUnit <= 0) {
      message.error('구매단위는 0보다 커야 합니다.')
      return
    }
    const now = new Date().toISOString()
    const unitPrice = round2(purchasePrice / purchaseUnit)

    const next: Ingredient = editing
      ? { ...editing, name, purchasePrice, purchaseUnit, unitPrice, unitLabel, updatedAtISO: now }
      : { id: newId(), name, purchasePrice, purchaseUnit, unitPrice, unitLabel, updatedAtISO: now }

    upsertIngredient(next)
    setOpenEdit(false)
    refresh()
  }

  const onExportCsv = () => {
    const header = '이름,가격,구매단위'
    const lines = items.map((x) => `${x.name},${x.purchasePrice},${x.purchaseUnit}`)
    const csv = '\ufeff' + [header, ...lines].join('\n')
    downloadText('ingredients.csv', csv, 'text/csv;charset=utf-8')
  }

  const onExportXlsx = () => {
    downloadXlsx(
      'ingredients.xlsx',
      'Ingredients',
      items.map((x) => ({
        이름: x.name,
        가격: x.purchasePrice,
        구매단위: x.purchaseUnit,
        단위가격: x.unitPrice,
        단위: x.unitLabel || (x.unitType === 'ea' ? '개' : 'g'),
      })),
    )
  }

  const buildXlsxPreview = async (file: File) => {
    const aoa = await parseXlsxFileToAOA(file, { preferredSheetName: 'Ingredients' })
    const byName = new Map(items.map((x) => [x.name.toLowerCase(), x]))

    if (aoa.length < 2) {
      const header = aoa[0] ?? []
      message.error(`엑셀 내용을 인식하지 못했습니다. (행 수=${aoa.length}, 헤더=${JSON.stringify(header).slice(0, 80)})`)
      return
    }
    const dataRows = aoa.slice(1) // 1행(헤더) 무시

    const rows: CsvPreviewRow<{ name: string; price: number; unit: number; unitLabel: string }>[] = dataRows.map((r, idx) => {
      const row = Array.isArray(r) ? (r as unknown[]) : []
      const nameRaw = String(row[0] ?? '')
      const priceRaw = row[1]
      const unitRaw = row[2]
      const unitLabelRaw = row[3]

      const name = nameRaw.trim()
      const price = safeNumber(priceRaw, NaN)
      const unitParsed = parseAmountAndUnit(unitRaw)
      const unit = Number.isFinite(unitParsed.amount) ? unitParsed.amount : safeNumber(unitRaw, NaN)
      const unitLabel = normalizeUnitLabel(unitLabelRaw) || unitParsed.unitLabel || 'g'

      const errors: string[] = []
      if (!name) errors.push('이름이 비었습니다.')
      if (!Number.isFinite(price) || price < 0) errors.push('가격이 올바르지 않습니다.')
      if (!Number.isFinite(unit) || unit <= 0) errors.push('구매단위가 올바르지 않습니다.')

      const existing = name ? byName.get(name.toLowerCase()) : undefined
      const same =
        existing &&
        existing.name === name &&
        existing.purchasePrice === price &&
        existing.purchaseUnit === unit

      const kind: CsvPreviewRow<{ name: string; price: number; unit: number }>['kind'] = errors.length
        ? 'invalid'
        : same
          ? 'same'
          : existing
            ? 'update'
            : 'create'

      return {
        key: `row_${idx + 2}_${name || 'unknown'}`,
        rowNo: idx + 2,
        parsed: { name, price, unit, unitLabel },
        parsedLabel: (
          <Space direction="vertical" size={0}>
            <Typography.Text>{name || '(이름 없음)'}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              가격 {String(priceRaw ?? '-')} / 구매단위 {String(unitRaw ?? '-')} / 단위 {unitLabel}
            </Typography.Text>
          </Space>
        ),
        existingLabel: existing ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{existing.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              가격 {existing.purchasePrice} / 구매단위 {existing.purchaseUnit} / 단위 {existing.unitLabel ?? (existing.unitType === 'ea' ? '개' : 'g')}
            </Typography.Text>
          </Space>
        ) : undefined,
        kind,
        errors,
        action: kind === 'invalid' || kind === 'same' ? 'skip' : 'upsert',
      }
    })

    setCsvRows(rows)
    setCsvOpen(true)
  }

  const applyCsv = () => {
    const byName = new Map(items.map((x) => [x.name.toLowerCase(), x]))
    const next = [...items]
    let created = 0
    let updated = 0
    let skipped = 0

    for (const r of csvRows) {
      if (r.kind === 'invalid' || r.action === 'skip') {
        skipped++
        continue
      }
      const nameKey = r.parsed.name.toLowerCase()
      const existing = byName.get(nameKey)
      const now = new Date().toISOString()
      const unitPrice = round2(r.parsed.price / r.parsed.unit)
      const unitLabel = normalizeUnitLabel((r.parsed as any).unitLabel) || 'g'

      if (existing) {
        const upd: Ingredient = {
          ...existing,
          name: r.parsed.name,
          purchasePrice: r.parsed.price,
          purchaseUnit: r.parsed.unit,
          unitPrice,
          unitLabel,
          updatedAtISO: now,
        }
        const idx = next.findIndex((x) => x.id === existing.id)
        if (idx >= 0) next[idx] = upd
        byName.set(nameKey, upd)
        updated++
      } else {
        const createdItem: Ingredient = {
          id: newId(),
          name: r.parsed.name,
          purchasePrice: r.parsed.price,
          purchaseUnit: r.parsed.unit,
          unitPrice,
          unitLabel,
          updatedAtISO: now,
        }
        next.push(createdItem)
        byName.set(nameKey, createdItem)
        created++
      }
    }

    saveIngredients(next)
    setCsvOpen(false)
    refresh()
    message.success(`적용 완료: 생성 ${created}, 갱신 ${updated}, 스킵 ${skipped}`)
  }

  return (
    <MobileShell
      title="재료 관리"
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
          title="재료 전체를 초기화할까요?"
          okText="초기화"
          cancelText="취소"
          onConfirm={() => {
            clearIngredients()
            refresh()
          }}
        >
          <Button danger icon={<ReloadOutlined />}>
            전체 초기화
          </Button>
        </Popconfirm>
      </Flex>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        업로드 엑셀 형식: 시트명 <b>Ingredients</b>(없으면 첫 시트) / 헤더 <b>이름</b>, <b>가격</b>, <b>구매단위</b>(예: 1000g / 10 개 / 1.5L), <b>단위</b>(선택)
      </Typography.Text>

      <Card size="small">
        <List
          dataSource={items}
          locale={{ emptyText: '재료가 없습니다. “추가” 또는 엑셀 업로드를 사용하세요.' }}
          renderItem={(it) => (
            <List.Item
              actions={[
                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openUpdate(it)}>
                  수정
                </Button>,
                <Popconfirm
                  key="del"
                  title="삭제할까요?"
                  okText="삭제"
                  cancelText="취소"
                  onConfirm={() => {
                    deleteIngredient(it.id)
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
                title={it.name}
                description={
                  <Typography.Text type="secondary">
                    구매 {it.purchasePrice} / 구매단위 {it.purchaseUnit} {it.unitLabel ?? (it.unitType === 'ea' ? '개' : 'g')} → 단가 {it.unitPrice}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        open={openEdit}
        title={editing ? '재료 수정' : '재료 추가'}
        onCancel={() => setOpenEdit(false)}
        onOk={onSave}
        okText="저장"
      >
        <Form form={form} layout="vertical">
          <Form.Item shouldUpdate noStyle>
            {() => {
              const unitOptions = Array.from(
                new Set(['g', '개', '장', ...items.map((x) => x.unitLabel ?? (x.unitType === 'ea' ? '개' : 'g'))].map((x) => String(x).trim()).filter(Boolean)),
              )
              // Select options를 form에 계속 쓰기 위해 hidden field로 넣는 대신, 렌더 스코프에서 사용
              void unitOptions
              return null
            }}
          </Form.Item>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="예) 우유" />
          </Form.Item>
          <Form.Item
            name="purchasePrice"
            label="구매가격"
            rules={[{ required: true, message: '구매가격을 입력하세요' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="purchaseUnit"
            label="구매단위"
            rules={[{ required: true, message: '구매단위를 입력하세요' }]}
          >
            <InputNumber min={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unitLabel" label="단위" initialValue="g">
            <Select
              showSearch
              placeholder="단위 선택"
              options={Array.from(
                new Set(['g', '개', '장', ...items.map((x) => x.unitLabel ?? (x.unitType === 'ea' ? '개' : 'g'))]
                  .map((x) => String(x).trim())
                  .filter(Boolean)),
              ).map((u) => ({ value: u, label: u }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <CsvPreviewModal
        open={csvOpen}
        title="엑셀 미리보기 (재료)"
        rows={csvRows}
        onClose={() => setCsvOpen(false)}
        onChangeRowAction={(key, action) =>
          setCsvRows((prev) => prev.map((r) => (r.key === key ? { ...r, action } : r)))
        }
        onBulkAction={(action) =>
          setCsvRows((prev) =>
            prev.map((r) => (r.kind === 'invalid' ? r : { ...r, action: r.kind === 'same' ? 'skip' : action })),
          )
        }
        onApply={applyCsv}
      />
    </MobileShell>
  )
}


