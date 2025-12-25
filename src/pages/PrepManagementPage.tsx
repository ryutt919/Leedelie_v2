import { useState, useEffect, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadPreps, savePrep, deletePrep } from '../storage';
import { loadIngredients } from '../storage';
import type { Prep, PrepIngredient, Ingredient } from '../types';

export function PrepManagementPage() {
  const [preps, setPreps] = useState<Prep[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [expandedPreps, setExpandedPreps] = useState<Set<string>>(new Set());
  const [editingPrep, setEditingPrep] = useState<Prep | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const loadedIngredients = loadIngredients();
    const loadedPreps = loadPreps();
    
    // 프렙의 총 비용과 예상 보충 날짜를 재계산하여 업데이트
    const updatedPreps = loadedPreps.map(prep => {
      const totalCost = calculateTotalCostForPrep(prep.ingredients, loadedIngredients);
      const expectedDate = calculateExpectedReplenishDate(prep);
      return { 
        ...prep, 
        totalCost,
        nextReplenishDate: expectedDate || prep.nextReplenishDate
      };
    });
    
    setIngredients(loadedIngredients);
    setPreps(updatedPreps);
  };

  const calculateTotalCostForPrep = (prepIngredients: PrepIngredient[], ingredientsList: Ingredient[]): number => {
    return prepIngredients.reduce((total, prepIng) => {
      const ingredient = ingredientsList.find(i => i.id === prepIng.ingredientId);
      if (ingredient) {
        return total + (ingredient.unitPrice * prepIng.quantity);
      }
      return total;
    }, 0);
  };

  const calculateTotalCost = (prepIngredients: PrepIngredient[]): number => {
    return calculateTotalCostForPrep(prepIngredients, ingredients);
  };

  const toggleExpand = (prepId: string) => {
    const newExpanded = new Set(expandedPreps);
    if (newExpanded.has(prepId)) {
      newExpanded.delete(prepId);
    } else {
      newExpanded.add(prepId);
    }
    setExpandedPreps(newExpanded);
  };

  // 보충 간격의 평균을 계산 (일 단위)
  const calculateAverageReplenishInterval = (replenishHistory: string[]): number | null => {
    if (replenishHistory.length < 2) return null;
    
    const intervals: number[] = [];
    for (let i = 1; i < replenishHistory.length; i++) {
      const prevDate = new Date(replenishHistory[i - 1]);
      const currDate = new Date(replenishHistory[i]);
      const diffTime = currDate.getTime() - prevDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      intervals.push(diffDays);
    }
    
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    return Math.round(average);
  };

  // 예상 보충 날짜 계산
  const calculateExpectedReplenishDate = (prep: Prep): string | null => {
    if (prep.replenishHistory.length === 0) return null;
    
    const averageInterval = calculateAverageReplenishInterval(prep.replenishHistory);
    if (averageInterval === null) return null;
    
    const lastReplenishDate = new Date(prep.replenishHistory[prep.replenishHistory.length - 1]);
    const expectedDate = new Date(lastReplenishDate);
    expectedDate.setDate(expectedDate.getDate() + averageInterval);
    
    return expectedDate.toISOString().split('T')[0];
  };

  const handleAddPrep = () => {
    const newPrep: Prep = {
      id: String(Date.now()),
      name: '',
      ingredients: [],
      replenishHistory: [],
      totalCost: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingPrep(newPrep);
    setShowAddForm(true);
  };

  const handleEditPrep = (prep: Prep) => {
    setEditingPrep({ ...prep });
    setShowAddForm(true);
  };

  const handleSavePrep = () => {
    if (!editingPrep || !editingPrep.name.trim()) {
      alert('프렙 이름을 입력해주세요.');
      return;
    }

    const totalCost = calculateTotalCost(editingPrep.ingredients);
    const expectedDate = calculateExpectedReplenishDate(editingPrep);
    const prepToSave: Prep = {
      ...editingPrep,
      totalCost,
      nextReplenishDate: expectedDate || undefined,
      updatedAt: new Date().toISOString()
    };

    savePrep(prepToSave);
    loadData();
    setShowAddForm(false);
    setEditingPrep(null);
  };

  const handleAddReplenishDate = (prepId: string, date: string) => {
    const prep = preps.find(p => p.id === prepId);
    if (!prep) return;

    const newHistory = [...prep.replenishHistory, date].sort();
    const updatedPrep: Prep = {
      ...prep,
      replenishHistory: newHistory,
      nextReplenishDate: calculateExpectedReplenishDate({ ...prep, replenishHistory: newHistory }) || undefined,
      updatedAt: new Date().toISOString()
    };

    savePrep(updatedPrep);
    loadData();
  };

  const handleRemoveReplenishDate = (prepId: string, dateToRemove: string) => {
    const prep = preps.find(p => p.id === prepId);
    if (!prep) return;

    const newHistory = prep.replenishHistory.filter(d => d !== dateToRemove);
    const updatedPrep: Prep = {
      ...prep,
      replenishHistory: newHistory,
      nextReplenishDate: calculateExpectedReplenishDate({ ...prep, replenishHistory: newHistory }) || undefined,
      updatedAt: new Date().toISOString()
    };

    savePrep(updatedPrep);
    loadData();
  };

  const handleDeletePrep = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deletePrep(id);
      loadData();
    }
  };

  const handleAddIngredient = () => {
    if (!editingPrep) return;
    const newIngredient: PrepIngredient = {
      ingredientId: '',
      ingredientName: '',
      quantity: 0
    };
    setEditingPrep({
      ...editingPrep,
      ingredients: [...editingPrep.ingredients, newIngredient]
    });
  };

  const handleRemoveIngredient = (index: number) => {
    if (!editingPrep) return;
    setEditingPrep({
      ...editingPrep,
      ingredients: editingPrep.ingredients.filter((_, i) => i !== index)
    });
  };

  const handleIngredientChange = (index: number, field: keyof PrepIngredient, value: string | number) => {
    if (!editingPrep) return;
    const updated = [...editingPrep.ingredients];
    updated[index] = { ...updated[index], [field]: value };
    
    // ingredientId가 변경되면 ingredientName도 업데이트
    if (field === 'ingredientId') {
      const ingredient = ingredients.find(i => i.id === value);
      if (ingredient) {
        updated[index].ingredientName = ingredient.name;
      }
    }
    
    setEditingPrep({ ...editingPrep, ingredients: updated });
  };

  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('CSV 파일 형식이 올바르지 않습니다.');
        return;
      }

      // 헤더 제거
      const dataLines = lines.slice(1);
      const newPreps: Prep[] = [];

      dataLines.forEach((line, index) => {
        const [name, nextReplenishDate, ...ingredientData] = line.split(',').map(s => s.trim());
        
        if (!name) return;

        const prepIngredients: PrepIngredient[] = [];
        // 재료 데이터는 "재료명:수량" 형식으로 가정
        for (let i = 0; i < ingredientData.length; i += 2) {
          const ingredientName = ingredientData[i];
          const quantity = parseFloat(ingredientData[i + 1] || '0');
          
          if (ingredientName) {
            const ingredient = ingredients.find(ing => ing.name === ingredientName);
            if (ingredient) {
              prepIngredients.push({
                ingredientId: ingredient.id,
                ingredientName: ingredient.name,
                quantity
              });
            }
          }
        }

        const totalCost = calculateTotalCost(prepIngredients);
        
        newPreps.push({
          id: String(Date.now() + index),
          name,
          ingredients: prepIngredients,
          replenishHistory: [],
          nextReplenishDate: nextReplenishDate || undefined,
          totalCost,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      newPreps.forEach(prep => savePrep(prep));
      loadData();
      alert(`${newPreps.length}개의 프렙이 추가되었습니다.`);
    };

    reader.readAsText(file, 'UTF-8');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '미설정';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <div className="container">
      <h1>프렙 관리</h1>

      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddPrep}>
          프렙 추가
        </Button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          CSV 업로드
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {showAddForm && editingPrep && (
        <Card title={editingPrep.id ? '프렙 수정' : '프렙 추가'}>
          <div className="form-row">
            <div className="input-group">
              <label>프렙 이름</label>
              <Input
                value={editingPrep.name}
                onChange={(e) => setEditingPrep({ ...editingPrep, name: e.target.value })}
                placeholder="예: 오이피클"
              />
            </div>
          </div>

          <div className="subsection-title">보충 이력</div>
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
            {editingPrep.replenishHistory.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>보충 날짜 목록:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {editingPrep.replenishHistory.map((date, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{formatDate(date)}</span>
                      <Button 
                        variant="danger" 
                        onClick={() => {
                          const newHistory = editingPrep.replenishHistory.filter((_, i) => i !== idx);
                          setEditingPrep({ ...editingPrep, replenishHistory: newHistory });
                        }}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
                {editingPrep.replenishHistory.length >= 2 && (
                  <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    평균 보충 간격: {calculateAverageReplenishInterval(editingPrep.replenishHistory)}일
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div className="input-group" style={{ flex: 1 }}>
                <label>보충 날짜 추가</label>
                <Input
                  type="date"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const newHistory = [...editingPrep.replenishHistory, e.target.value].sort();
                      setEditingPrep({ ...editingPrep, replenishHistory: newHistory });
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </div>
          {editingPrep.replenishHistory.length >= 2 && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e0f2fe', borderRadius: '8px', color: 'var(--text)' }}>
              <strong>예상 보충 날짜:</strong> {formatDate(calculateExpectedReplenishDate(editingPrep) || undefined)}
            </div>
          )}

          <div className="subsection-title">재료 목록</div>
          {editingPrep.ingredients.map((prepIng, index) => (
            <div key={index} className="form-row" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
              <div className="input-group">
                <label>재료</label>
                <select
                  className="select"
                  value={prepIng.ingredientId}
                  onChange={(e) => handleIngredientChange(index, 'ingredientId', e.target.value)}
                >
                  <option value="">재료 선택</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>{ing.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>수량</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={prepIng.quantity}
                  onChange={(e) => handleIngredientChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="input-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button variant="danger" onClick={() => handleRemoveIngredient(index)}>
                  삭제
                </Button>
              </div>
            </div>
          ))}

          <div className="actions">
            <Button variant="secondary" onClick={handleAddIngredient}>
              재료 추가
            </Button>
          </div>

          <div className="actions" style={{ marginTop: '1.5rem' }}>
            <Button variant="primary" onClick={handleSavePrep}>
              저장
            </Button>
            <Button variant="secondary" onClick={() => { setShowAddForm(false); setEditingPrep(null); }}>
              취소
            </Button>
          </div>
        </Card>
      )}

      <div className="schedules-list">
        {preps.length === 0 ? (
          <div className="empty-message">등록된 프렙이 없습니다.</div>
        ) : (
          preps.map(prep => (
            <Card key={prep.id} title={prep.name}>
              {!expandedPreps.has(prep.id) ? (
                <div>
                  <div className="summary-item">
                    <strong>다음 보충 예상 날짜:</strong>
                    <span>{formatDate(prep.nextReplenishDate)}</span>
                    {prep.replenishHistory.length >= 2 && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        (평균 간격: {calculateAverageReplenishInterval(prep.replenishHistory)}일)
                      </span>
                    )}
                  </div>
                  <div className="summary-item" style={{ marginTop: '0.5rem' }}>
                    <strong>프렙 총 재료 비용:</strong>
                    <span>{prep.totalCost.toLocaleString('ko-KR')}원</span>
                  </div>
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.875rem' }}>보충 날짜 추가</label>
                        <Input
                          type="date"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddReplenishDate(prep.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="actions" style={{ marginTop: '1rem' }}>
                    <Button variant="primary" onClick={() => toggleExpand(prep.id)}>
                      자세히 보기
                    </Button>
                    <Button variant="secondary" onClick={() => handleEditPrep(prep)}>
                      수정
                    </Button>
                    <Button variant="danger" onClick={() => handleDeletePrep(prep.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="summary-item">
                    <strong>다음 보충 예상 날짜:</strong>
                    <span>{formatDate(prep.nextReplenishDate)}</span>
                    {prep.replenishHistory.length >= 2 && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        (평균 간격: {calculateAverageReplenishInterval(prep.replenishHistory)}일)
                      </span>
                    )}
                  </div>
                  <div className="summary-item" style={{ marginTop: '0.5rem' }}>
                    <strong>프렙 총 재료 비용:</strong>
                    <span>{prep.totalCost.toLocaleString('ko-KR')}원</span>
                  </div>

                  <div className="subsection-title" style={{ marginTop: '1.5rem' }}>보충 이력</div>
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg)', borderRadius: '8px' }}>
                    {prep.replenishHistory.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>보충 이력이 없습니다.</p>
                    ) : (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {prep.replenishHistory.map((date, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                              <span>{formatDate(date)}</span>
                              <Button 
                                variant="danger" 
                                onClick={() => handleRemoveReplenishDate(prep.id, date)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                              >
                                삭제
                              </Button>
                            </div>
                          ))}
                        </div>
                        {prep.replenishHistory.length >= 2 && (
                          <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            평균 보충 간격: {calculateAverageReplenishInterval(prep.replenishHistory)}일
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.875rem' }}>보충 날짜 추가</label>
                        <Input
                          type="date"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddReplenishDate(prep.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="subsection-title" style={{ marginTop: '1.5rem' }}>재료 목록</div>
                  {prep.ingredients.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>등록된 재료가 없습니다.</p>
                  ) : (
                    <div className="schedule-table-wrapper">
                      <table className="schedule-table">
                        <thead>
                          <tr>
                            <th>재료명</th>
                            <th>수량</th>
                            <th>단위 가격</th>
                            <th>총 가격</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prep.ingredients.map((prepIng, index) => {
                            const ingredient = ingredients.find(i => i.id === prepIng.ingredientId);
                            const itemTotal = ingredient ? ingredient.unitPrice * prepIng.quantity : 0;
                            return (
                              <tr key={index}>
                                <td>{prepIng.ingredientName || '알 수 없음'}</td>
                                <td>{prepIng.quantity}</td>
                                <td>{ingredient ? `${ingredient.unitPrice.toLocaleString('ko-KR')}원` : '-'}</td>
                                <td>{itemTotal.toLocaleString('ko-KR')}원</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="actions" style={{ marginTop: '1rem' }}>
                    <Button variant="primary" onClick={() => toggleExpand(prep.id)}>
                      접기
                    </Button>
                    <Button variant="secondary" onClick={() => handleEditPrep(prep)}>
                      수정
                    </Button>
                    <Button variant="danger" onClick={() => handleDeletePrep(prep.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

