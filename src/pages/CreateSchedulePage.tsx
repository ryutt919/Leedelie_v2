import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Checkbox } from '../components/Checkbox';
import { Person, Schedule, ShiftType, ValidationError, StaffConfig } from '../types';
import { validateScheduleInputs, getDaysInMonth } from '../validator';
import { generateSchedule, validateGeneratedSchedule, ScheduleGenerationError, exportSchedulesToXlsx } from '../generator';
import { getScheduleById, saveSchedule, saveStaffConfig, loadStaffConfig } from '../storage';
import { getWorkRules } from '../workRules';

type RequestMode = 'off' | 'half';

type DayRequestSummary = {
  key: string;
  text: string;
  kind: 'off' | 'half';
};

export function CreateSchedulePage() {
  const location = useLocation();
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
  const [dailyStaffByDate, setDailyStaffByDate] = useState<Record<number, number>>({});
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);

  const rules = getWorkRules();

  useEffect(() => {
    const state = location.state as { editScheduleId?: string } | null;
    const id = state?.editScheduleId;
    if (!id) return;

    const existing = getScheduleById(id);
    if (!existing) return;

    setEditingScheduleId(existing.id);
    setEditingCreatedAt(existing.createdAt);
    setYear(existing.year);
    setMonth(existing.month);
    setPeople(existing.people);
    setPeopleCount(existing.people.length);
    setDailyStaffByDate(existing.dailyStaffByDate ?? {});
    setConfirmed(true);
    setSelectedPersonId(existing.people[0]?.id ?? null);
    setSchedule(existing);
    setErrors([]);
  }, [location.state]);

  // 마운트 시 편집 모드가 아니면 저장된 직원 구성 자동 로드
  useEffect(() => {
    const state = location.state as { editScheduleId?: string } | null;
    if (state?.editScheduleId) return; // 편집 모드면 자동 로드하지 않음

    const configs = loadStaffConfig();
    if (configs && configs.length > 0) {
      const loadedPeople: Person[] = configs.map((c: StaffConfig) => ({
        id: c.id,
        name: c.name,
        canOpen: c.canOpen,
        canMiddle: c.canMiddle,
        canClose: c.canClose,
        mustOpen: c.mustOpen ?? false,
        mustClose: c.mustClose ?? false,
        preferredShift: (c.preferredShift as ShiftType) ?? 'middle',
        openPriority: c.openPriority,
        middlePriority: c.middlePriority,
        closePriority: c.closePriority,
        requestedDaysOff: [],
        halfRequests: {}
      }));
      setPeople(loadedPeople);
      setPeopleCount(loadedPeople.length);
      setSelectedPersonId(loadedPeople[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 인원 수 변경 시 배열 초기화
  const handlePeopleCountChange = (count: string) => {
    const num = parseInt(count) || 0;
    setPeopleCount(num);
    setConfirmed(false);
    setSchedule(null);
    
    const newPeople: Person[] = [];
    for (let i = 0; i < num; i++) {
      if (people[i]) {
        newPeople.push(people[i]);
      } else {
        newPeople.push({
          id: crypto.randomUUID(),
          name: '',
          canOpen: true,
          canMiddle: true,
          canClose: true,
          mustOpen: false,
          mustClose: false,
          preferredShift: 'middle',
          requestedDaysOff: [],
          halfRequests: {}
        });
      }
    }
    setPeople(newPeople);
    setSelectedPersonId(newPeople[0]?.id ?? null);
  };

  // 개별 인원 정보 업데이트
  const updatePerson = (index: number, updates: Partial<Person>, resetConfirm = true) => {
    const newPeople = [...people];
    newPeople[index] = { ...newPeople[index], ...updates };
    setPeople(newPeople);
    if (resetConfirm) setConfirmed(false);
    setSchedule(null);
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

      updatePerson(personIndex, { requestedDaysOff: newDaysOff, halfRequests: newHalfRequests }, false);
      return;
    }

    // half 모드
    const newHalfRequests = { ...person.halfRequests };
    if (newHalfRequests[day] !== undefined) {
      delete newHalfRequests[day];
    } else {
      // 기본 하프 시프트: 선호 > 가능 여부 고려
      if (person.preferredShift === 'open' && person.canOpen) newHalfRequests[day] = 'open';
      else if (person.preferredShift === 'middle' && person.canMiddle) newHalfRequests[day] = 'middle';
      else if (person.preferredShift === 'close' && person.canClose) newHalfRequests[day] = 'close';
      else if (person.canMiddle) newHalfRequests[day] = 'middle';
      else if (person.canOpen) newHalfRequests[day] = 'open';
      else newHalfRequests[day] = 'close';
    }
    const newDaysOff = person.requestedDaysOff.filter((d: number) => d !== day);
    updatePerson(personIndex, { requestedDaysOff: newDaysOff, halfRequests: newHalfRequests }, false);
  };

  const setHalfShiftForSelected = (day: number, shift: ShiftType) => {
    const personIndex = getSelectedPersonIndex();
    if (personIndex === -1) return;
    const person = people[personIndex];
    if (person.halfRequests[day] === undefined) return;
    updatePerson(personIndex, { halfRequests: { ...person.halfRequests, [day]: shift } }, false);
  };

  // 직원 구성 저장/불러오기
  const handleSaveStaffConfig = () => {
    const configs: StaffConfig[] = people.map(p => ({
      id: p.id,
      name: p.name,
      canOpen: p.canOpen,
      canMiddle: p.canMiddle,
      canClose: p.canClose,
      mustOpen: p.mustOpen || undefined,
      mustClose: p.mustClose || undefined,
      preferredShift: p.preferredShift ?? null,
      openPriority: p.openPriority,
      middlePriority: p.middlePriority,
      closePriority: p.closePriority
    }));
    saveStaffConfig(configs);
    alert('직원 구성이 저장되었습니다.');
  };

  const handleLoadStaffConfig = () => {
    const configs = loadStaffConfig();
    if (!configs || configs.length === 0) {
      alert('저장된 직원 구성이 없습니다.');
      return;
    }

    const loadedPeople: Person[] = configs.map((c: StaffConfig) => ({
      id: c.id,
      name: c.name,
      canOpen: c.canOpen,
      canMiddle: c.canMiddle,
      canClose: c.canClose,
      mustOpen: c.mustOpen ?? false,
      mustClose: c.mustClose ?? false,
      preferredShift: (c.preferredShift as ShiftType) ?? 'middle',
      openPriority: c.openPriority,
      middlePriority: c.middlePriority,
      closePriority: c.closePriority,
      requestedDaysOff: [],
      halfRequests: {}
    }));

    setPeople(loadedPeople);
    setPeopleCount(loadedPeople.length);
    setSelectedPersonId(loadedPeople[0]?.id ?? null);
    setConfirmed(false);
    setSchedule(null);
  };

  const formatStaff = (value: number): string => {
    const s = value.toString();
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };

  const incrementDailyStaff = (day: number) => {
    setDailyStaffByDate((prev: Record<number, number>) => {
      const base = rules.DAILY_STAFF_BASE;
      const max = rules.DAILY_STAFF_MAX;

      const current = prev[day] ?? base;
      const next = { ...prev };

      // 1 단위로 증가, 최대치 초과 시 기본값으로
      const nextValue = current < max ? current + 1 : base;

      if (nextValue === base) {
        delete next[day];
      } else {
        next[day] = nextValue;
      }
      return next;
    });
    setSchedule(null);
  };

  // 스케줄 생성
  const handleGenerate = () => {
    const validationErrors = validateScheduleInputs(year, month, people, dailyStaffByDate);
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setSchedule(null);
      return;
    }

    try {
      const generated = generateSchedule(year, month, people, dailyStaffByDate);
      const newSchedule = editingScheduleId
        ? {
            ...generated,
            id: editingScheduleId,
            createdAt: editingCreatedAt ?? generated.createdAt,
            updatedAt: new Date().toISOString()
          }
        : generated;

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

          const formatAssignedName = (personName: string, isHalf?: boolean) => (isHalf ? `${personName}(하프)` : personName);

          const dateObj = new Date(s.year, s.month - 1, dayNum);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          return (
            <div key={dayNum} className={`calendar-cell ${isWeekend ? 'weekend' : ''}`}
            >
              <div className="calendar-date">{dayNum}</div>
              <div className="calendar-line">
                <span className="calendar-label">오픈</span>
                <span>{openPeople.map(p => formatAssignedName(p.personName, p.isHalf)).join(', ') || '-'}</span>
              </div>
              <div className="calendar-line">
                <span className="calendar-label">미들</span>
                <span>{middlePeople.map(p => formatAssignedName(p.personName, p.isHalf)).join(', ') || '-'}</span>
              </div>
              <div className="calendar-line">
                <span className="calendar-label">마감</span>
                <span>{closePeople.map(p => formatAssignedName(p.personName, p.isHalf)).join(', ') || '-'}</span>
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

          const canHalfOpen = !!person && person.canOpen;
          const canHalfMiddle = !!person && person.canMiddle;
          const canHalfClose = !!person && person.canClose;

          const staffForDay = dailyStaffByDate[dayNum] ?? rules.DAILY_STAFF_BASE;
          const isBaseStaff = staffForDay === rules.DAILY_STAFF_BASE;

          const summaries: DayRequestSummary[] = people
            .map((p: Person) => {
              if (p.requestedDaysOff.includes(dayNum)) {
                return { key: `${p.id}-off`, text: `(${p.name}/휴무)`, kind: 'off' as const };
              }
              const hs = p.halfRequests?.[dayNum];
              if (hs !== undefined) {
                const hsLabel = hs === 'open' ? '오픈' : hs === 'middle' ? '미들' : '마감';
                return { key: `${p.id}-half`, text: `(${p.name}/하프/${hsLabel})`, kind: 'half' as const };
              }
              return null;
            })
            .filter((v: DayRequestSummary | null): v is DayRequestSummary => v !== null);

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
              <div className="request-day-top">
                <div className="calendar-date">{dayNum}</div>
                <button
                  type="button"
                  className={`staff-toggle ${isBaseStaff ? '' : 'custom-staff'}`}
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    incrementDailyStaff(dayNum);
                  }}
                >
                  {formatStaff(staffForDay)}인
                </button>
              </div>

              {summaries.length > 0 && (
                <div className="request-summaries" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                  {summaries.map((s: DayRequestSummary) => (
                    <div key={s.key} className={`request-summary ${s.kind}`}> {s.text} </div>
                  ))}
                </div>
              )}

              {isHalf && (
                <div className="half-shift-buttons" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'open' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'open')}
                    disabled={!canHalfOpen}
                  >
                    오픈
                  </button>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'middle' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'middle')}
                    disabled={!canHalfMiddle}
                  >
                    미들
                  </button>
                  <button
                    type="button"
                    className={`half-shift-btn ${halfShift === 'close' ? 'active' : ''}`}
                    onClick={() => setHalfShiftForSelected(dayNum, 'close')}
                    disabled={!canHalfClose}
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
                  checked={person.canMiddle}
                  onChange={(v) => updatePerson(index, { canMiddle: v })}
                  label="미들 가능"
                />
                <Checkbox
                  checked={person.canClose}
                  onChange={(v) => updatePerson(index, { canClose: v })}
                  label="마감 가능"
                />
              </div>

              <Select
                label="선호 시프트"
                value={person.preferredShift}
                onChange={(v) => updatePerson(index, { preferredShift: v as ShiftType })}
                options={[
                  { value: 'open', label: '오픈' },
                  { value: 'middle', label: '미들' },
                  { value: 'close', label: '마감' }
                ]}
              />

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

              <div style={{ marginTop: '1rem' }}>
                <h5 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  시프트 우선순위 (선택, 1~{peopleCount})
                </h5>
                <div className="form-row">
                  <Input
                    label="오픈 우선순위"
                    type="number"
                    value={person.openPriority?.toString() ?? ''}
                    onChange={(v) => updatePerson(index, { openPriority: v ? parseInt(v) : undefined })}
                    placeholder="미설정"
                    min={1}
                    max={peopleCount}
                  />
                  <Input
                    label="미들 우선순위"
                    type="number"
                    value={person.middlePriority?.toString() ?? ''}
                    onChange={(v) => updatePerson(index, { middlePriority: v ? parseInt(v) : undefined })}
                    placeholder="미설정"
                    min={1}
                    max={peopleCount}
                  />
                  <Input
                    label="마감 우선순위"
                    type="number"
                    value={person.closePriority?.toString() ?? ''}
                    onChange={(v) => updatePerson(index, { closePriority: v ? parseInt(v) : undefined })}
                    placeholder="미설정"
                    min={1}
                    max={peopleCount}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="actions">
          <Button onClick={handleConfirmPeople} variant="secondary" disabled={!canConfirm}>
            확인
          </Button>
          <Button onClick={handleSaveStaffConfig} variant="secondary">
            직원 구성 저장
          </Button>
          <Button onClick={handleLoadStaffConfig} variant="secondary">
            직원 구성 불러오기
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
                const fullWorkDays = schedule.assignments
                  .filter(day => day.people.some(p => p.personId === person.id && !p.isHalf))
                  .map(day => day.date);

                const halfDays = schedule.assignments
                  .filter(day => day.people.some(p => p.personId === person.id && !!p.isHalf))
                  .map(day => day.date);

                const workEquivalent = fullWorkDays.length + halfDays.length * 0.5;
                const offDays = person.requestedDaysOff;
                const offEquivalent = offDays.length + halfDays.length * 0.5;
                
                return (
                  <div key={person.id} className="person-stats">
                    <h4>{person.name}</h4>
                    <div className="stat-item">
                      <strong>근무(환산):</strong>
                      <span>{formatStaff(workEquivalent)}일</span>
                    </div>
                    <div className="stat-item">
                      <strong>하프:</strong>
                      <span>{halfDays.length}일</span>
                    </div>
                    <div className="stat-item">
                      <strong>휴무:</strong>
                      <span>{formatStaff(offEquivalent)}일</span>
                    </div>
                
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
