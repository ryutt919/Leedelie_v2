import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Person, Schedule } from '../types';
import { loadSchedules, deleteSchedule } from '../storage';
import { exportSchedulesToXlsx } from '../generator';
import { getDaysInMonth } from '../validator';

export function ManageSchedulesPage() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterName, setFilterName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const data = loadSchedules();
    setSchedules(data);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deleteSchedule(id);
      loadData();
    }
  };

  const handleExport = () => {
    const filtered = getFilteredSchedules();
    if (filtered.length === 0) {
      alert('내보낼 스케줄이 없습니다.');
      return;
    }
    exportSchedulesToXlsx(filtered);
  };

  const renderCalendar = (s: Schedule) => {
    const daysInMonth = getDaysInMonth(s.year, s.month);
    const firstWeekday = new Date(s.year, s.month - 1, 1).getDay();
    const totalCells = firstWeekday + daysInMonth;
    const weekCount = Math.ceil(totalCells / 7);
    const cells = Array.from({ length: weekCount * 7 }, (_, i) => {
      const dayNum = i - firstWeekday + 1;
      return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
    });

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    return (
      <div className="calendar">
        {dayNames.map((name: string) => (
          <div key={name} className="calendar-header">
            {name}
          </div>
        ))}

        {cells.map((dayNum: number | null, idx: number) => {
          if (!dayNum) {
            return <div key={`e-${idx}`} className="calendar-cell empty" />;
          }

          const assignment = s.assignments.find(a => a.date === dayNum);
          const openPeople = assignment ? assignment.people.filter(p => p.shift === 'open') : [];
          const closePeople = assignment ? assignment.people.filter(p => p.shift === 'close') : [];

          const dateObj = new Date(s.year, s.month - 1, dayNum);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          return (
            <div key={dayNum} className={`calendar-cell ${isWeekend ? 'weekend' : ''}`}>
              <div className="calendar-date">{dayNum}</div>
              <div className="calendar-line">
                <span className="calendar-label">오픈</span>
                <span>{openPeople.map(p => p.personName).join(', ') || '-'}</span>
              </div>
              <div className="calendar-line">
                <span className="calendar-label">마감</span>
                <span>{closePeople.map(p => p.personName).join(', ') || '-'}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const getFilteredSchedules = () => {
    return schedules.filter(schedule => {
      if (filterYear && schedule.year !== parseInt(filterYear)) return false;
      if (filterMonth && schedule.month !== parseInt(filterMonth)) return false;
      if (filterName) {
        const hasName = schedule.people.some(p => 
          p.name.toLowerCase().includes(filterName.toLowerCase())
        );
        if (!hasName) return false;
      }
      return true;
    });
  };

  const filtered = getFilteredSchedules();

  return (
    <div className="container">
      <h1>스케줄 관리/조회</h1>

      <Card title="필터">
        <div className="form-row">
          <Input
            type="number"
            label="연도"
            value={filterYear}
            onChange={setFilterYear}
            placeholder="전체"
          />
          <Input
            type="number"
            label="월"
            value={filterMonth}
            onChange={setFilterMonth}
            placeholder="전체"
            min={1}
            max={12}
          />
          <Input
            label="인원 이름"
            value={filterName}
            onChange={setFilterName}
            placeholder="검색"
          />
        </div>
        <div className="actions">
          <Button onClick={handleExport} variant="secondary">
            엑셀 내보내기
          </Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <p className="empty-message">저장된 스케줄이 없습니다.</p>
          <Button onClick={() => navigate('/create')}>
            새 스케줄 만들기
          </Button>
        </Card>
      ) : (
        <div className="schedules-list">
          {filtered.map(schedule => (
            <Card key={schedule.id} title={`${schedule.year}년 ${schedule.month}월`}>
              <div className="schedule-summary">
                <div className="summary-item">
                  <strong>근무 인원:</strong>
                  <span>{schedule.people.map((p: Person) => p.name).join(', ')}</span>
                </div>
                <div className="summary-item">
                  <strong>생성일:</strong>
                  <span>{new Date(schedule.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <div className="summary-item">
                  <strong>수정일:</strong>
                  <span>{new Date(schedule.updatedAt).toLocaleDateString('ko-KR')}</span>
                </div>
              </div>

              <h4 className="subsection-title">인원별 근무 통계</h4>
              <div className="stats-grid">
                {schedule.people.map((person: Person) => {
                  const workDays = schedule.assignments
                    .filter(day => day.people.some(p => p.personId === person.id))
                    .map(day => day.date);
                  const offDays = person.requestedDaysOff;

                  return (
                    <div key={person.id} className="person-stats">
                      <h4>{person.name}</h4>
                      <div className="stat-item">
                        <strong>근무일수:</strong>
                        <span>{workDays.length}일</span>
                      </div>
                      <div className="stat-item">
                        <strong>휴무일수:</strong>
                        <span>{offDays.length}일</span>
                      </div>
                      {offDays.length > 0 && (
                        <div className="stat-item">
                          <strong>휴무일:</strong>
                          <span>{offDays.sort((a, b) => a - b).join(', ')}일</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <h4 className="subsection-title">달력 전체 보기</h4>
              <div className="calendar-wrapper">{renderCalendar(schedule)}</div>

              <div className="actions">
                <Button onClick={() => handleDelete(schedule.id)} variant="danger">
                  삭제
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
