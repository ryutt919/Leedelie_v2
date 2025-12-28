import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, DatePicker, Input, List, Modal, Popconfirm, Space, Typography } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Shift } from '../domain/types'
import { MobileShell } from '../layouts/MobileShell'
import { deleteSchedule, loadSchedules } from '../storage/schedulesRepo'
import { exportScheduleXlsx } from '../utils/scheduleExport'
import { downloadXlsx } from '../utils/xlsxExport'

export function ManageSchedulesPage() {
  const nav = useNavigate()
  const [tick, setTick] = useState(0)
  const [filterYm, setFilterYm] = useState<Dayjs | null>(null)
  const [nameQ, setNameQ] = useState('')
  const [detail, setDetail] = useState<(ReturnType<typeof loadSchedules>[number]) | null>(null)

  const schedules = useMemo(() => {
    void tick
    return loadSchedules()
  }, [tick])
  const filtered = useMemo(() => {
    const q = nameQ.trim().toLowerCase()
    return schedules
      .filter((s) => {
        if (!filterYm) return true
        return s.year === filterYm.year() && s.month === filterYm.month() + 1
      })
      .filter((s) => {
        if (!q) return true
        return s.staff.some((m) => m.name.toLowerCase().includes(q))
      })
      .sort((a, b) => b.updatedAtISO.localeCompare(a.updatedAtISO))
  }, [filterYm, nameQ, schedules])

  return (
    <MobileShell
      title="스케줄 관리/조회"
      right={
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            const rows = filtered.map((s) => ({
              연: s.year,
              월: s.month,
              인원수: s.staff.length,
              직원: s.staff.map((m) => m.name).join(', '),
              업데이트: dayjs(s.updatedAtISO).format('YYYY-MM-DD HH:mm'),
            }))
            downloadXlsx('schedules_filtered.xlsx', 'Schedules', rows)
          }}
          disabled={filtered.length === 0}
        >
          필터 엑셀
        </Button>
      }
    >
      <Card size="small" title="필터">
        <Space direction="vertical" style={{ width: '100%' }}>
          <DatePicker
            picker="month"
            value={filterYm}
            onChange={(v) => setFilterYm(v)}
            style={{ width: '100%' }}
            placeholder="연/월 선택(전체면 비움)"
          />
          <Input
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            placeholder="이름 검색(직원명 포함 스케줄)"
          />
        </Space>
      </Card>

      <Card size="small" style={{ marginTop: 12 }}>
        <List
          dataSource={filtered}
          locale={{ emptyText: '저장된 스케줄이 없습니다.' }}
          renderItem={(s) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => nav(`/create?editId=${encodeURIComponent(s.id)}`)}
                >
                  수정
                </Button>,
                <Button key="view" type="link" icon={<EyeOutlined />} onClick={() => setDetail(s)}>
                  보기
                </Button>,
                <Button key="exp" type="link" icon={<DownloadOutlined />} onClick={() => exportScheduleXlsx(s)}>
                  내보내기
                </Button>,
                <Popconfirm
                  key="del"
                  title="삭제할까요?"
                  okText="삭제"
                  cancelText="취소"
                  onConfirm={() => {
                    deleteSchedule(s.id)
                    setTick((x) => x + 1)
                  }}
                >
                  <Button danger type="link" icon={<DeleteOutlined />}>
                    삭제
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={`${s.year}-${String(s.month).padStart(2, '0')} (${s.staff.length}명)`}
                description={
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">
                      업데이트: {dayjs(s.updatedAtISO).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      인원: {s.staff.map((m) => m.name).join(', ')}
                    </Typography.Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="팁" style={{ marginTop: 12 }}>
        <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
          각 스케줄은 localStorage에 저장됩니다. “수정”은 스케줄 생성 화면으로 편집 모드로
          이동합니다.
        </Typography.Paragraph>
      </Card>

      <Modal
        open={!!detail}
        title={detail ? `${detail.year}-${String(detail.month).padStart(2, '0')} 스케줄` : '스케줄'}
        onCancel={() => setDetail(null)}
        footer={null}
        width={720}
      >
        {detail ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Card size="small" title="인원별 통계">
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {detail.stats
                  .slice()
                  .sort((a, b) => b.workUnits - a.workUnits)
                  .map((st) => (
                    <Typography.Text key={st.staffId}>
                      {st.name}: 근무환산 {st.workUnits} (풀 {st.fullDays}, 하프 {st.halfDays}, 휴무 {st.offDays})
                    </Typography.Text>
                  ))}
              </Space>
            </Card>

            <Card size="small" title="월간 전체 달력(일자별)">
              <Collapse
                size="small"
                items={detail.assignments.map((a) => ({
                  key: a.dateISO,
                  label: a.dateISO,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {(['open', 'middle', 'close'] as Shift[]).map((shift) => (
                        <div key={shift}>
                          <Typography.Text strong>
                            {shift === 'open' ? '오픈' : shift === 'middle' ? '미들' : '마감'}
                          </Typography.Text>
                          <Typography.Text type="secondary">
                            {' '}
                            {a.byShift[shift]
                              .map((x) => {
                                const nm = detail.staff.find((s) => s.id === x.staffId)?.name ?? x.staffId
                                return `${nm}(${x.unit})`
                              })
                              .join(' / ') || '-'}
                          </Typography.Text>
                        </div>
                      ))}
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Space>
        ) : null}
      </Modal>
    </MobileShell>
  )
}


