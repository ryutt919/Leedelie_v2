import { Link } from 'react-router-dom';
import { useEffect, useState, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { WorkRules, ShiftType } from '../constants';
import { getWorkRules, saveWorkRules } from '../workRules';

export function HomePage() {
  const [rules, setRules] = useState<WorkRules>(getWorkRules());
  const [shiftPriorityInput, setShiftPriorityInput] = useState<string>('');

  useEffect(() => {
    setRules(getWorkRules());
  }, []);

  const handleSaveRules = () => {
    const baseUnitsRaw = rules.DAILY_STAFF_BASE * 2;
    const maxUnitsRaw = rules.DAILY_STAFF_MAX * 2;

    if (!rules.DAILY_STAFF_BASE || rules.DAILY_STAFF_BASE < 0.5 || rules.DAILY_STAFF_BASE > 20 || !Number.isInteger(baseUnitsRaw)) {
      alert('기본 근무 인원은 0.5~20 사이(0.5 단위)로 입력해주세요.');
      return;
    }
    if (!rules.DAILY_STAFF_MAX || rules.DAILY_STAFF_MAX < rules.DAILY_STAFF_BASE || rules.DAILY_STAFF_MAX > 20 || !Number.isInteger(maxUnitsRaw)) {
      alert('최대 근무 인원은 기본 근무 인원 이상, 20 이하(0.5 단위)로 입력해주세요.');
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

  const handleSetShiftPriority = (headcount: number) => {
    if (!shiftPriorityInput.trim()) {
      alert('우선순위를 입력해주세요. (쉼표로 구분: 예: open,close,middle)');
      return;
    }

    const shifts = shiftPriorityInput.split(',').map(s => s.trim().toLowerCase()) as ShiftType[];
    const validShifts = ['open', 'middle', 'close'];
    
    if (!shifts.every(s => validShifts.includes(s))) {
      alert('유효하지 않은 시프트입니다. (open, middle, close만 허용)');
      return;
    }

    if (shifts.length !== new Set(shifts).size) {
      alert('중복된 시프트가 있습니다.');
      return;
    }

    const newPriority = { ...rules.SHIFT_PRIORITY || {} };
    newPriority[headcount] = shifts;

    setRules({ ...rules, SHIFT_PRIORITY: newPriority });
    setShiftPriorityInput('');
  };

  const handleDeleteShiftPriority = (headcount: number) => {
    const newPriority = { ...rules.SHIFT_PRIORITY || {} };
    delete newPriority[headcount];
    setRules({ ...rules, SHIFT_PRIORITY: Object.keys(newPriority).length > 0 ? newPriority : undefined });
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
            <strong>기본 근무 인원</strong>
            <input
              className="input"
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={rules.DAILY_STAFF_BASE}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRules({ ...rules, DAILY_STAFF_BASE: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="info-item">
            <strong>최대 근무 인원</strong>
            <input
              className="input"
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={rules.DAILY_STAFF_MAX}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRules({ ...rules, DAILY_STAFF_MAX: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRules({ ...rules, WORK_HOURS: parseInt(e.target.value) || 0 })}
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRules({ ...rules, BREAK_HOURS: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="subsection-title">오픈/미들/마감 우선순위</div>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            근무 인원 수에 따라 시프트 배정 우선순위를 설정할 수 있습니다. (선택사항)
          </p>
          
          <div className="form-row">
            <div className="input-group">
              <label>인원 수</label>
              <select className="select" id="shift-headcount">
                <option value="">선택...</option>
                {Array.from({ length: Math.floor(rules.DAILY_STAFF_MAX) + 2 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}명</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>우선순위 (쉼표 구분)</label>
              <input
                className="input"
                type="text"
                placeholder="예: open,close,middle"
                value={shiftPriorityInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setShiftPriorityInput(e.target.value)}
              />
            </div>
            <div className="input-group" style={{ justifyContent: 'flex-end' }}>
              <Button 
                variant="secondary" 
                onClick={() => {
                  const headcount = parseInt((document.getElementById('shift-headcount') as HTMLSelectElement).value);
                  if (!headcount) {
                    alert('인원 수를 선택해주세요.');
                    return;
                  }
                  handleSetShiftPriority(headcount);
                }}
              >
                설정
              </Button>
            </div>
          </div>

          {rules.SHIFT_PRIORITY && Object.entries(rules.SHIFT_PRIORITY).length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>설정된 우선순위:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(rules.SHIFT_PRIORITY).map(([headcount, shifts]) => (
                  <div key={headcount} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'var(--bg)', borderRadius: '6px' }}>
                    <span>{headcount}명: {shifts.join(' → ')}</span>
                    <Button 
                      variant="danger" 
                      onClick={() => handleDeleteShiftPriority(parseInt(headcount))}
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                    >
                      삭제
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
