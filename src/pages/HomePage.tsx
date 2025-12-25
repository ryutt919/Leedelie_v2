import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function HomePage() {
  return (
    <div className="container">
      <div className="cards-grid">
        <Card title="근무 스케줄 생성">
          <p>새로운 월간 근무 스케줄을 생성합니다.</p>
          <p>인원 배치, 오픈/마감조 관리, 휴무일 설정 등을 자동으로 처리합니다.</p>
          <Link to="/create">
            <Button variant="primary">스케줄 생성하기</Button>
          </Link>
        </Card>

        <Card title="스케줄 관리/조회">
          <p>저장된 스케줄을 조회하고 관리합니다.</p>
          <p>수정, 삭제, JSON 내보내기 등의 기능을 제공합니다.</p>
          <Link to="/manage">
            <Button variant="secondary">관리하기</Button>
          </Link>
        </Card>
      </div>

      <div className="info-section">
        <h2>근무 규칙</h2>
        <div className="info-grid">
          <div className="info-item">
            <strong>오픈조 출근</strong>
            <span>07:00</span>
          </div>
          <div className="info-item">
            <strong>마감조 출근</strong>
            <span>11:00</span>
          </div>
          <div className="info-item">
            <strong>1일 근무 인원</strong>
            <span>3명</span>
          </div>
          <div className="info-item">
            <strong>1인 근무 시간</strong>
            <span>8시간 + 휴게 1시간</span>
          </div>
        </div>
      </div>
    </div>
  );
}
