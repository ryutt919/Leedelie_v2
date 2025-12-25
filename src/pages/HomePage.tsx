import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { WorkRules } from '../constants';
import { getWorkRules, saveWorkRules } from '../workRules';

export function HomePage() {
  const [rules, setRules] = useState<WorkRules>(getWorkRules());

  useEffect(() => {
    setRules(getWorkRules());
  }, []);

  const handleSaveRules = () => {
    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(rules.OPEN_TIME) || !timePattern.test(rules.CLOSE_TIME)) {
      alert('시간 형식은 HH:MM 입니다. 예) 07:00');
      return;
    }
    if (!rules.DAILY_STAFF || rules.DAILY_STAFF < 1 || rules.DAILY_STAFF > 20) {
      alert('1일 근무 인원은 1~20 사이로 입력해주세요.');
      return;
    }
    if (rules.WORK_HOURS < 1 || rules.WORK_HOURS > 24) {
      alert('근무 시간은 1~24 사이로 입력해주세요.');
      return;
    }
    if (rules.BREAK_HOURS < 0 || rules.BREAK_HOURS > 8) {
      alert('휴게 시간은 0~8 사이로 입력해주세요.');
      return;
    }

    saveWorkRules(rules);
    alert('근무 규칙이 저장되었습니다.');
  };

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
          <p>삭제, 엑셀(XLSX) 내보내기 등의 기능을 제공합니다.</p>
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
            <input
              className="input"
              type="time"
              value={rules.OPEN_TIME}
              onChange={(e) => setRules({ ...rules, OPEN_TIME: e.target.value })}
            />
          </div>
          <div className="info-item">
            <strong>마감조 출근</strong>
            <input
              className="input"
              type="time"
              value={rules.CLOSE_TIME}
              onChange={(e) => setRules({ ...rules, CLOSE_TIME: e.target.value })}
            />
          </div>
          <div className="info-item">
            <strong>1일 근무 인원</strong>
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              value={rules.DAILY_STAFF}
              onChange={(e) => setRules({ ...rules, DAILY_STAFF: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="info-item">
            <strong>1인 근무 시간</strong>
            <div className="rule-inline">
              <div className="rule-inline-item">
                <span className="rule-inline-label">근무</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={24}
                  value={rules.WORK_HOURS}
                  onChange={(e) => setRules({ ...rules, WORK_HOURS: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="rule-inline-item">
                <span className="rule-inline-label">휴게</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={8}
                  value={rules.BREAK_HOURS}
                  onChange={(e) => setRules({ ...rules, BREAK_HOURS: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="actions">
          <Button variant="primary" onClick={handleSaveRules}>
            규칙 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
