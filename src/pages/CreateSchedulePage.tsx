import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Checkbox } from '../components/Checkbox';
import { Person, Schedule, ValidationError } from '../types';
import { WORK_RULES } from '../constants';
import { validateScheduleInputs, getDaysInMonth } from '../validator';
import { generateSchedule } from '../generator';
import { saveSchedule } from '../storage';

export function CreateSchedulePage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [peopleCount, setPeopleCount] = useState(3);
  const [people, setPeople] = useState<Person[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  // 인원 수 변경 시 배열 초기화
  const handlePeopleCountChange = (count: string) => {
    const num = parseInt(count) || 0;
    setPeopleCount(num);
    
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
          workDaysPerWeek: WORK_RULES.DEFAULT_WORK_DAYS_PER_WEEK
        });
      }
    }
    setPeople(newPeople);
  };

  // 개별 인원 정보 업데이트
  const updatePerson = (index: number, updates: Partial<Person>) => {
    const newPeople = [...people];
    newPeople[index] = { ...newPeople[index], ...updates };
    setPeople(newPeople);
  };

  // 휴무일 토글
  const toggleDayOff = (personIndex: number, day: number) => {
    const person = people[personIndex];
    const newDaysOff = person.requestedDaysOff.includes(day)
      ? person.requestedDaysOff.filter(d => d !== day)
      : [...person.requestedDaysOff, day];
    updatePerson(personIndex, { requestedDaysOff: newDaysOff });
  };

  // 스케줄 생성
  const handleGenerate = () => {
    const validationErrors = validateScheduleInputs(year, month, people);
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setSchedule(null);
      return;
    }

    const newSchedule = generateSchedule(year, month, people);
    setSchedule(newSchedule);
    setErrors([]);
  };

  // 스케줄 저장
  const handleSave = () => {
    if (schedule) {
      saveSchedule(schedule);
      alert('스케줄이 저장되었습니다!');
      navigate('/manage');
    }
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
          {people.map((person, index) => (
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

              <Input
                type="number"
                label="주 근무일수"
                value={person.workDaysPerWeek}
                onChange={(v) => updatePerson(index, { workDaysPerWeek: parseInt(v) || 5 })}
                min={1}
                max={7}
              />

              <div className="days-off-selector">
                <label>휴무 요청일</label>
                <div className="days-grid">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
                    <button
                      key={day}
                      type="button"
                      className={`day-btn ${person.requestedDaysOff.includes(day) ? 'selected' : ''}`}
                      onClick={() => toggleDayOff(index, day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {errors.length > 0 && (
        <Card title="오류">
          <div className="errors">
            {errors.map((error, i) => (
              <div key={i} className="error-message">
                {error.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="actions">
        <Button onClick={handleGenerate} variant="primary">
          스케줄 생성
        </Button>
      </div>

      {schedule && (
        <Card title={`${schedule.year}년 ${schedule.month}월 스케줄`}>
          <div className="schedule-table-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>요일</th>
                  <th>오픈조 (07:00)</th>
                  <th>마감조 (11:00)</th>
                </tr>
              </thead>
              <tbody>
                {schedule.assignments.map(day => {
                  const date = new Date(schedule.year, schedule.month - 1, day.date);
                  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                  const dayName = dayNames[date.getDay()];
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  const openPeople = day.people.filter(p => p.shift === 'open');
                  const closePeople = day.people.filter(p => p.shift === 'close');

                  return (
                    <tr key={day.date} className={isWeekend ? 'weekend' : ''}>
                      <td>{day.date}일</td>
                      <td>{dayName}</td>
                      <td>{openPeople.map(p => p.personName).join(', ') || '-'}</td>
                      <td>{closePeople.map(p => p.personName).join(', ') || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <Button onClick={handleSave} variant="primary">
              저장하기
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
