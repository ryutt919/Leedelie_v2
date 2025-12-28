import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Drawer, Flex, Layout, Typography, theme } from 'antd'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { PageHeader } from '../components/PageHeader'

export function MobileShell({
  title,
  children,
  right,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
}) {
  const { token } = theme.useToken()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  const canBack = useMemo(() => loc.pathname !== '/', [loc.pathname])

  return (
    <Layout style={{ minHeight: '100%', background: token.colorBgLayout }}>
      <div className="app-max" style={{ background: token.colorBgLayout }}>
        <Layout.Header
          style={{
            padding: 0,
            height: 52,
            lineHeight: '52px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <PageHeader
            title={title}
            onBack={canBack ? () => nav(-1) : undefined}
            onOpenMenu={() => setOpen(true)}
            right={right}
          />
        </Layout.Header>

        <Layout.Content style={{ padding: 16, paddingBottom: 88 }}>
          {children}
        </Layout.Content>

        <Layout.Footer
          style={{
            padding: 0,
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'transparent',
          }}
        >
          <div className="app-max">
            <BottomNav />
          </div>
        </Layout.Footer>
      </div>

      <Drawer
        title="메뉴"
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        width={320}
      >
        <Flex vertical gap={12}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            로컬 저장소(localStorage)에 데이터가 저장됩니다.
          </Typography.Paragraph>

          <Flex gap={8} wrap>
            <Button
              icon={<InfoCircleOutlined />}
              onClick={() => {
                setOpen(false)
                nav('/')
              }}
            >
              홈
            </Button>
            <Button
              icon={<ReloadOutlined />}
              danger
              onClick={() => {
                // 다음 단계에서 “전체 초기화”를 기능별로 정교하게 제공.
                localStorage.clear()
                window.location.reload()
              }}
            >
              전체 초기화
            </Button>
          </Flex>
        </Flex>
      </Drawer>
    </Layout>
  )
}


