import { Button, Card, Flex, Form, InputNumber, Space, Typography, message } from 'antd'
import { Link } from 'react-router-dom'
import { MobileShell } from '../layouts/MobileShell'
import type { WorkRules } from '../domain/types'
import { loadWorkRules, saveWorkRules } from '../storage/workRulesRepo'

export function HomePage() {
  const [form] = Form.useForm<WorkRules>()

  return (
    <MobileShell title="홈">
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        모바일 우선 스케줄/재료/프렙 관리
      </Typography.Paragraph>

      <Card size="small" title="빠른 이동">
        <Flex gap={8} wrap>
          <Link to="/create">
            <Button type="primary">스케줄 생성</Button>
          </Link>
          <Link to="/manage">
            <Button>스케줄 관리</Button>
          </Link>
          <Link to="/preps">
            <Button>프렙/소스</Button>
          </Link>
          <Link to="/ingredients">
            <Button>재료</Button>
          </Link>
        </Flex>
      </Card>

      <Card size="small" title="근무 규칙" style={{ marginTop: 12 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={loadWorkRules()}
          onFinish={(v) => {
            if (v.DAILY_STAFF_BASE < 0.5) return message.error('기본 근무 인원은 0.5 이상이어야 합니다.')
            if (v.DAILY_STAFF_MAX < v.DAILY_STAFF_BASE) return message.error('최대 근무 인원은 기본 이상이어야 합니다.')
            if (v.WORK_HOURS <= 0) return message.error('근무시간이 올바르지 않습니다.')
            if (v.BREAK_HOURS < 0) return message.error('휴게시간이 올바르지 않습니다.')
            saveWorkRules(v)
            message.success('저장 완료')
          }}
        >
          <Flex gap={8}>
            <Form.Item name="DAILY_STAFF_BASE" label="기본 인원" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="DAILY_STAFF_MAX" label="최대 인원" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={8} style={{ marginTop: 10 }}>
            <Form.Item name="WORK_HOURS" label="근무시간" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="BREAK_HOURS" label="휴게시간" style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>

          <Space style={{ marginTop: 12 }}>
            <Button type="primary" htmlType="submit">
              저장
            </Button>
          </Space>
        </Form>
      </Card>
    </MobileShell>
  )
}


