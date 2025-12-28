import { ArrowLeftOutlined, MenuOutlined } from '@ant-design/icons'
import { Button, Flex, Typography } from 'antd'
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  onBack,
  onOpenMenu,
  right,
}: {
  title: string
  onBack?: () => void
  onOpenMenu?: () => void
  right?: ReactNode
}) {
  return (
    <Flex align="center" justify="space-between" style={{ height: 52, padding: '0 12px' }}>
      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
        {onBack ? (
          <Button aria-label="뒤로" icon={<ArrowLeftOutlined />} type="text" onClick={onBack} />
        ) : null}
        <Typography.Text strong ellipsis style={{ fontSize: 16, maxWidth: 240 }}>
          {title}
        </Typography.Text>
      </Flex>

      <Flex align="center" gap={8}>
        {right}
        {onOpenMenu ? (
          <Button aria-label="메뉴" icon={<MenuOutlined />} type="text" onClick={onOpenMenu} />
        ) : null}
      </Flex>
    </Flex>
  )
}


