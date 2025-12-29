import { Card } from 'antd'
import { Link } from 'react-router-dom'
import { MobileShell } from '../layouts/MobileShell'

export function HomePage() {
  return (
    <MobileShell title="홈">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        marginTop: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Link to="/create" style={{ width: '100%', maxWidth: 400, textDecoration: 'none' }}>
          <Card hoverable style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, borderRadius: 18, boxShadow: '0 2px 12px #0001' }}>
            스케줄 생성
          </Card>
        </Link>
        <Link to="/manage" style={{ width: '100%', maxWidth: 400, textDecoration: 'none' }}>
          <Card hoverable style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, borderRadius: 18, boxShadow: '0 2px 12px #0001' }}>
            스케줄 관리
          </Card>
        </Link>
        <Link to="/preps" style={{ width: '100%', maxWidth: 400, textDecoration: 'none' }}>
          <Card hoverable style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, borderRadius: 18, boxShadow: '0 2px 12px #0001' }}>
            프렙/소스
          </Card>
        </Link>
        <Link to="/ingredients" style={{ width: '100%', maxWidth: 400, textDecoration: 'none' }}>
          <Card hoverable style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, borderRadius: 18, boxShadow: '0 2px 12px #0001' }}>
            재료
          </Card>
        </Link>
      </div>
    </MobileShell>
  )
}
