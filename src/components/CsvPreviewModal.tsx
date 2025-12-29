import { CheckCircleOutlined, ExclamationCircleOutlined, StopOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Modal, Segmented, Space, Table, Tag, Typography } from 'antd'
import { useMemo } from 'react'
import type { ReactNode } from 'react'

export type CsvRowAction = 'upsert' | 'skip'

export type CsvPreviewRow<TParsed> = {
  key: string
  rowNo: number
  parsed: TParsed
  parsedLabel: ReactNode
  existingLabel?: ReactNode
  kind: 'create' | 'update' | 'same' | 'invalid'
  errors: string[]
  action: CsvRowAction
}

export function CsvPreviewModal<TParsed>({
  open,
  title,
  rows,
  onClose,
  onChangeRowAction,
  onBulkAction,
  onApply,
}: {
  open: boolean
  title: string
  rows: CsvPreviewRow<TParsed>[]
  onClose: () => void
  onChangeRowAction: (key: string, action: CsvRowAction) => void
  onBulkAction: (action: CsvRowAction) => void
  onApply: () => void
}) {
  const summary = useMemo(() => {
    let create = 0
    let update = 0
    let same = 0
    let invalid = 0
    for (const r of rows) {
      if (r.kind === 'create') create++
      else if (r.kind === 'update') update++
      else if (r.kind === 'same') same++
      else invalid++
    }
    return { create, update, same, invalid, total: rows.length }
  }, [rows])

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={720}
      footer={
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Space size={6} wrap>
            <Tag icon={<CheckCircleOutlined />} color="green">
              추가 {summary.create}
            </Tag>
            <Tag icon={<CheckCircleOutlined />} color="blue">
              갱신 {summary.update}
            </Tag>
            <Tag icon={<StopOutlined />} color="default">
              동일 {summary.same}
            </Tag>
            <Tag icon={<ExclamationCircleOutlined />} color="red">
              오류 {summary.invalid}
            </Tag>
          </Space>

          <Flex gap={8}>
            <Segmented
              options={[
                { label: '전체 갱신', value: 'upsert' },
                { label: '전체 무시', value: 'skip' },
              ]}
              onChange={(v) => onBulkAction(v as CsvRowAction)}
            />
            <Button type="primary" onClick={onApply} disabled={rows.length === 0}>
              적용
            </Button>
          </Flex>
        </Flex>
      }
    >
      {rows.length === 0 ? (
        <Alert type="info" message="미리볼 데이터가 없습니다." />
      ) : null}

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        행별로 <b>갱신/무시</b>를 선택한 뒤 적용하세요. 오류가 있는 행은 기본적으로 무시로
        설정됩니다.
      </Typography.Paragraph>

      <Table<CsvPreviewRow<TParsed>>
        size="small"
        dataSource={rows}
        rowKey="key"
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        tableLayout="fixed"
        scroll={{ x: 980 }}
        columns={[
          {
            title: '#',
            dataIndex: 'rowNo',
            width: 56,
          },
          {
            title: 'CSV',
            dataIndex: 'parsedLabel',
            width: 240,
            onCell: () => ({
              style: {
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              },
            }),
          },
          {
            title: '기존',
            dataIndex: 'existingLabel',
            width: 220,
            render: (v) => v ?? <Typography.Text type="secondary">없음</Typography.Text>,
            onCell: () => ({
              style: {
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              },
            }),
          },
          {
            title: '상태',
            dataIndex: 'kind',
            width: 90,
            render: (k) => {
              if (k === 'invalid') return <Tag color="red">오류</Tag>
              if (k === 'same') return <Tag>동일</Tag>
              if (k === 'update') return <Tag color="blue">갱신</Tag>
              return <Tag color="green">추가</Tag>
            },
          },
          {
            title: '오류',
            dataIndex: 'errors',
            width: 220,
            render: (errs: string[]) =>
              errs?.length ? (
                <Space direction="vertical" size={2}>
                  {errs.slice(0, 2).map((e) => (
                    <Typography.Text key={e} type="danger">
                      {e}
                    </Typography.Text>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">-</Typography.Text>
              ),
          },
          {
            title: '액션',
            dataIndex: 'action',
            width: 160,
            render: (action: CsvRowAction, row) => (
              <Segmented
                value={action}
                options={[
                  { label: '갱신', value: 'upsert' },
                  { label: '무시', value: 'skip' },
                ]}
                disabled={row.kind === 'invalid'}
                onChange={(v) => onChangeRowAction(row.key, v as CsvRowAction)}
              />
            ),
          },
        ]}
      />
    </Modal>
  )
}


