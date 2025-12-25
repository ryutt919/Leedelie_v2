import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Schedule } from '../types';
import { loadSchedules, deleteSchedule } from '../storage';
import { exportToJSON } from '../generator';

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
    exportToJSON(filtered);
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
            JSON 내보내기
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
                  <span>{schedule.people.map(p => p.name).join(', ')}</span>
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

              <div className="schedule-table-wrapper">
                <table className="schedule-table compact">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>오픈</th>
                      <th>마감</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.assignments.slice(0, 10).map(day => {
                      const openPeople = day.people.filter(p => p.shift === 'open');
                      const closePeople = day.people.filter(p => p.shift === 'close');
                      
                      return (
                        <tr key={day.date}>
                          <td>{day.date}일</td>
                          <td>{openPeople.map(p => p.personName).join(', ')}</td>
                          <td>{closePeople.map(p => p.personName).join(', ')}</td>
                        </tr>
                      );
                    })}
                    {schedule.assignments.length > 10 && (
                      <tr>
                        <td colSpan={3} className="more-info">
                          ... 외 {schedule.assignments.length - 10}일
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

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
