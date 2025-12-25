import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Checkbox } from '../components/Checkbox';
import { Person, Schedule, ShiftType, ValidationError } from '../types';
import { validateScheduleInputs, getDaysInMonth } from '../validator';
import { generateSchedule, validateGeneratedSchedule, ScheduleGenerationError, exportSchedulesToXlsx } from '../generator';
import { saveSchedule } from '../storage';

type RequestMode = 'off' | 'half';

export function CreateSchedulePage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [peopleCount, setPeopleCount] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [requestMode, setRequestMode] = useState<RequestMode>('off');

  // 인원 수 변경 시 배열 초기화
  const handlePeopleCountChange = (count: string) => {
    const num = parseInt(count) || 0;
    setPeopleCount(num);
    setConfirmed(false);
    
    const newPeople: Person[] = [];
    for (let i = 0; i < num; i++) {
      if (people[i]) {
        newPeople.push(people[i]);
      } else {
        newPeople.push({
          id: crypto.randomUUID(),
          name: '',
          canOpen: true,
          canClose: true,
          mustOpen: false,
          mustClose: false,
          requestedDaysOff: [],
          halfRequests: {}
        });
      }
    }
    setPeople(newPeople);
    setSelectedPersonId(newPeople[0]?.id ?? null);
  };

  // 개별 인원 정보 업데이트
  const updatePerson = (index: number, updates: Partial<Person>) => {
    const newPeople = [...people];
    newPeople[index] = { ...newPeople[index], ...updates };
    setPeople(newPeople);
    setConfirmed(false);
  };

  const canConfirm = people.length > 0 && people.every((p: Person) => p.name.trim().length > 0);

  const handleConfirmPeople = () => {
    if (!canConfirm) {
      alert('모든 인원의 이름을 입력해주세요.');
      return;
    }
    setConfirmed(true);
    setSelectedPersonId((prev: string | null) => prev ?? people[0]?.id ?? null);
  };

  const getSelectedPersonIndex = () => {
    if (!selectedPersonId) return -1;
    return people.findIndex((p: Person) => p.id === selectedPersonId);
  };

  const toggleCalendarDayForSelected = (day: number) => {
    const personIndex = getSelectedPersonIndex();
    if (personIndex === -1) return;
    const person = people[personIndex];

    if (requestMode === 'off') {
      const newDaysOff = person.requestedDaysOff.includes(day)
        ? person.requestedDaysOff.filter((d: number) => d !== day)
        : [...person.requestedDaysOff, day];

      const newHalfRequests = { ...person.halfRequests };
      if (newDaysOff.includes(day)) {
        delete newHalfRequests[day];
      }

      updatePerson(personIndex, { requestedDaysOff: newDaysOff, halfRequests: newHalfRequests });
      return;
    }

    // half 모드
    const newHalfRequests = { ...person.halfRequests };
    if (newHalfRequests[day] !== undefined) {
      delete newHalfRequests[day];
    } else {
      newHalfRequests[day] = 'middle';
    }
    const newDaysOff = person.requestedDaysOff.filter((d: number) => d !== day);
    updatePerson(personIndex, { requestedDaysOff: newDaysOff, halfRequests: newHalfRequests });
  };

  const setHalfShiftForSelected = (day: number, shift: ShiftType) => {
    const personIndex = getSelectedPersonIndex();
    if (personIndex === -1) return;
    const person = people[personIndex];
    if (person.halfRequests[day] === undefined) return;
    updatePerson(personIndex, { halfRequests: { ...person.halfRequests, [day]: shift } });
  };

  // 스케줄 생성
  const handleGenerate = () => {
    const validationErrors = validateScheduleInputs(year, month, people);
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setSchedule(null);
      return;
    }

    try {
      const newSchedule = generateSchedule(year, month, people);

      // 생성된 스케줄 검증(방어적)
      const generationErrors = validateGeneratedSchedule(newSchedule);
      if (generationErrors.length > 0) {
        setErrors(generationErrors);
        setSchedule(null);
        return;
      }

      setSchedule(newSchedule);
      setErrors([]);
    } catch (err) {
      if (err instanceof ScheduleGenerationError) {
        setErrors(err.errors);
        setSchedule(null);
        return;
      }
      setErrors([{ type: 'unknown', message: '스케줄 생성 중 알 수 없는 오류가 발생했습니다.' }]);
      setSchedule(null);
    }
  };

  // 스케줄 저장
  const handleSave = () => {
    if (schedule) {
      saveSchedule(schedule);
      alert('스케줄이 저장되었습니다!');
      navigate('/manage');
    }
  };

  const handleExportExcel = () => {
    if (!schedule) return;
    exportSchedulesToXlsx([schedule]);
  };

  const renderCalendar = (s: Schedule) => {
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
        {dayNames.map(name => (
          <div key={name} className="calendar-header">
            {name}
          </div>
        ))}
        {cells.map((dayNum, idx) => {
          if (!dayNum) {
            return <div key={`e-${idx}`} className="calendar-cell empty" />;
          }

          const assignment = s.assignments.find(a => a.date === dayNum);
          const openPeople = assignment ? assignment.people.filter(p => p.shift === 'open') : [];
          const middlePeople = assignment ? assignment.people.filter(p => p.shift === 'middle') : [];
          const closePeople = assignment ? assignment.people.filter(p => p.shift === 'close') : [];

          const dateObj = new Date(s.year, s.month - 1, dayNum);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          return (
            <div key={dayNum} className={`calendar-cell ${isWeekend ? 'weekend' : ''}`}
            >
              <div className="calendar-date">{dayNum}</div>
              <div className="calendar-line">
                <span className="calendar-label">오픈</span>
                <span>{openPeople.map(p => p.personName).join(', ') || '-'}</span>
              </div>
              <div className="calendar-line">
                <span className="calendar-label">미들</span>
                <span>{middlePeople.map(p => p.personName).join(', ') || '-'}</span>
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

  const renderRequestCalendar = (yearValue: number, monthValue: number) => {
    const days = getDaysInMonth(yearValue, monthValue);
    const firstWeekday = new Date(yearValue, monthValue - 1, 1).getDay();
    const totalCells = firstWeekday + days;
    const weekCount = Math.ceil(totalCells / 7);
    const cells = Array.from({ length: weekCount * 7 }, (_, i) => {
      const dayNum = i - firstWeekday + 1;
      return dayNum >= 1 && dayNum <= days ? dayNum : null;
    });

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const personIndex = getSelectedPersonIndex();
    const person = personIndex >= 0 ? people[personIndex] : null;

    return (
      <div className="request-calendar">
        {dayNames.map(name => (
          <div key={name} className="calendar-header">
            {name}
          </div>
        ))}

        {cells.map((dayNum, idx) => {
          if (!dayNum) return <div key={`e-${idx}`} className="calendar-cell empty" />;

          const dateObj = new Date(yearValue, monthValue - 1, dayNum);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          const isOff = !!person && person.requestedDaysOff.includes(dayNum);
          const isHalf = !!person && person.halfRequests[dayNum] !== undefined;
          const halfShift = person ? person.halfRequests[dayNum] : undefined;

          return (
            <div
              key={dayNum}
              className={`request-day-cell ${isWeekend ? 'weekend' : ''} ${isOff ? 'selected' : ''} ${isHalf ? 'half-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => toggleCalendarDayForSelected(dayNum)}
              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') toggleCalendarDayForSelected(dayNum);
              }}
            >
              <div className="calendar-date">{dayNum}</div>

              {isHalf && (
                <div className="half-shift-buttons" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'open' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'open')}
                  >
                    오픈
                  </button>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'middle' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'middle')}
                  >
                    미들
                  </button>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'close' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'close')}
                  >
                    마감
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const yearOptions = Array.from({ length: 10 }, (_, i) => ({
    value: currentYear + i - 2,
    label: `${currentYear + i - 2}년`
  }));

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}월`
  }));

  const daysInMonth = getDaysInMonth(year, month);

  return (
    <div className="container">
      <h1>근무 스케줄 생성</h1>

      <Card title="기본 설정">
        <div className="form-row">
          <Select
            label="연도"
            value={year}
            onChange={(v) => setYear(parseInt(v))}
            options={yearOptions}
          />
          <Select
            label="월"
            value={month}
            onChange={(v) => setMonth(parseInt(v))}
            options={monthOptions}
          />
        </div>
      </Card>

      <Card title="근무 인원 설정">
        <Input
          type="number"
          label="인원 수"
          value={peopleCount}
          onChange={handlePeopleCountChange}
          min={1}
          max={20}
        />

        <div className="people-list">
          {people.map((person: Person, index: number) => (
            <div key={person.id} className="person-editor">
              <h4>인원 {index + 1}</h4>
              
              <Input
                label="이름"
                value={person.name}
                onChange={(v) => updatePerson(index, { name: v })}
                placeholder="이름 입력"
              />

              <div className="checkbox-group">
                <Checkbox
                  checked={person.canOpen}
                  onChange={(v) => updatePerson(index, { canOpen: v })}
                  label="오픈 가능"
                />
                <Checkbox
                  checked={person.canClose}
                  onChange={(v) => updatePerson(index, { canClose: v })}
                  label="마감 가능"
                />
              </div>

              <div className="checkbox-group">
                <Checkbox
                  checked={person.mustOpen}
                  onChange={(v) => updatePerson(index, { mustOpen: v })}
                  label="오픈 필수"
                />
                <Checkbox
                  checked={person.mustClose}
                  onChange={(v) => updatePerson(index, { mustClose: v })}
                  label="마감 필수"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="actions">
          <Button onClick={handleConfirmPeople} variant="secondary" disabled={!canConfirm}>
            확인
          </Button>
        </div>
      </Card>

      {confirmed && people.length > 0 && (
        <Card title="휴무/하프 설정">
          <div className="request-editor">
            <div className="person-picker">
              {people.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`person-chip ${selectedPersonId === p.id ? 'active' : ''}`}
                  onClick={() => setSelectedPersonId(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="request-mode">
              <button
                type="button"
                className={`request-mode-btn ${requestMode === 'off' ? 'active' : ''}`}
                onClick={() => setRequestMode('off')}
              >
                휴무
              </button>
              <button
                type="button"
                className={`request-mode-btn half ${requestMode === 'half' ? 'active' : ''}`}
                onClick={() => setRequestMode('half')}
              >
                하프
              </button>
            </div>

            <div className="calendar-wrapper">
              {renderRequestCalendar(year, month)}
            </div>
          </div>
        </Card>
      )}

      {errors.length > 0 && (
        <Card title="❌ 스케줄 생성 불가">
          <p style={{ marginBottom: '1rem', color: 'var(--danger)', fontWeight: 'bold' }}>
            다음 문제를 해결한 후 다시 시도해주세요:
          </p>
          <div className="errors">
            {errors.map((error, i) => (
              <div key={i} className="error-message">
                {error.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="actions actions-bottom-gap">
        <Button onClick={handleGenerate} variant="primary">
          스케줄 생성
        </Button>
      </div>

      {schedule && (
        <>
          <Card title="인원별 근무 통계">
            <div className="stats-grid">
              {schedule.people.map((person: Person) => {
                const workDays = schedule.assignments.filter(day =>
                  day.people.some(p => p.personId === person.id)
                ).map(day => day.date);
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
          </Card>

          <Card title={`${schedule.year}년 ${schedule.month}월 스케줄`}>
          <div className="actions">
            <Button onClick={handleExportExcel} variant="secondary">
              엑셀 내보내기
            </Button>
          </div>

          <div className="calendar-wrapper">{renderCalendar(schedule)}</div>

          <div className="actions">
            <Button onClick={handleSave} variant="primary">
              저장하기
            </Button>
          </div>
        </Card>
        </>
      )}
    </div>
  );
}
