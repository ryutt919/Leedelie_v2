import { useState, useEffect, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadPreps, savePreps, deletePrep, applyPreviewActionsForPreps } from '../storage';
import { loadIngredients } from '../storage';
import CsvPreviewModal from '../components/CsvPreviewModal';
import type { CsvPreviewItem, CsvAction } from '../types';
import { exportPrepsToXlsx, exportPrepsToCsv } from '../generator';
import type { Prep, PrepIngredient, Ingredient } from '../types';

export function PrepManagementPage() {
  const [preps, setPreps] = useState<Prep[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [expandedPreps, setExpandedPreps] = useState<Set<string>>(new Set());
  const [editingPrep, setEditingPrep] = useState<Prep | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [previewItems, setPreviewItems] = useState<CsvPreviewItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    const loadedIngredients = loadIngredients();
    const loadedPreps = loadPreps();
    const updatedPreps = loadedPreps.map(prep => ({
      ...prep,
      totalCost: calculateTotalCostForPrep(prep.ingredients, loadedIngredients),
      nextReplenishDate: calculateExpectedReplenishDate(prep) || prep.nextReplenishDate
    }));
    setIngredients(loadedIngredients);
    setPreps(updatedPreps);
  };

  const calculateTotalCostForPrep = (prepIngredients: PrepIngredient[], ingredientsList: Ingredient[]): number => {
    return prepIngredients.reduce((total, prepIng) => {
      const ingredient = ingredientsList.find(i => i.id === prepIng.ingredientId);
      return ingredient ? total + (ingredient.unitPrice * prepIng.quantity) : total;
    }, 0);
  };

  const calculateTotalCost = (prepIngredients: PrepIngredient[]) => calculateTotalCostForPrep(prepIngredients, ingredients);

  const toggleExpand = (prepId: string) => { const newExpanded = new Set(expandedPreps); newExpanded.has(prepId) ? newExpanded.delete(prepId) : newExpanded.add(prepId); setExpandedPreps(newExpanded); };

  const calculateAverageReplenishInterval = (replenishHistory: string[]): number | null => {
    if (replenishHistory.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < replenishHistory.length; i++) {
      const prev = new Date(replenishHistory[i - 1]);
      const cur = new Date(replenishHistory[i]);
      intervals.push((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    }
    return Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
  };

  const calculateExpectedReplenishDate = (prep: Prep): string | null => {
    if (!prep.replenishHistory || prep.replenishHistory.length === 0) return null;
    const avg = calculateAverageReplenishInterval(prep.replenishHistory);
    if (avg === null) return null;
    const last = new Date(prep.replenishHistory[prep.replenishHistory.length - 1]);
    last.setDate(last.getDate() + avg);
    return last.toISOString().split('T')[0];
  };

  const handleAddPrep = () => { setEditingPrep({ id: String(Date.now()), name: '', ingredients: [], replenishHistory: [], totalCost: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setShowAddForm(true); };

  const handleEditPrep = (prep: Prep) => { setEditingPrep({ ...prep }); setShowAddForm(true); };

  const handleSavePrep = () => {
    if (!editingPrep || !editingPrep.name.trim()) { alert('프렙/소스 이름을 입력해주세요.'); return; }
    const totalCost = calculateTotalCost(editingPrep.ingredients);
    const expectedDate = calculateExpectedReplenishDate(editingPrep);
    const prepToSave: Prep = { ...editingPrep, totalCost, nextReplenishDate: expectedDate || undefined, updatedAt: new Date().toISOString() };
    const existingPreps = loadPreps();
    const existingIndex = existingPreps.findIndex(p => p.id === prepToSave.id);
    if (existingIndex >= 0) existingPreps[existingIndex] = prepToSave; else existingPreps.push(prepToSave);
    savePreps(existingPreps); loadData(); setShowAddForm(false); setEditingPrep(null);
  };

  const handleAddReplenishDate = (prepId: string, date: string) => {
    const prep = preps.find(p => p.id === prepId); if (!prep) return;
    const newHistory = [...prep.replenishHistory, date].sort();
    const updatedPrep: Prep = { ...prep, replenishHistory: newHistory, nextReplenishDate: calculateExpectedReplenishDate({ ...prep, replenishHistory: newHistory }) || undefined, updatedAt: new Date().toISOString() };
    const existingPreps = loadPreps(); const idx = existingPreps.findIndex(p => p.id === prepId); if (idx >= 0) { existingPreps[idx] = updatedPrep; savePreps(existingPreps); }
    loadData();
  };

  const handleRemoveReplenishDate = (prepId: string, dateToRemove: string) => {
    const prep = preps.find(p => p.id === prepId); if (!prep) return;
    const newHistory = prep.replenishHistory.filter(d => d !== dateToRemove);
    const updatedPrep: Prep = { ...prep, replenishHistory: newHistory, nextReplenishDate: calculateExpectedReplenishDate({ ...prep, replenishHistory: newHistory }) || undefined, updatedAt: new Date().toISOString() };
    const existingPreps = loadPreps(); const idx = existingPreps.findIndex(p => p.id === prepId); if (idx >= 0) { existingPreps[idx] = updatedPrep; savePreps(existingPreps); }
    loadData();
  };

  const handleDeletePrep = (id: string) => { if (confirm('정말 삭제하시겠습니까?')) { deletePrep(id); loadData(); } };

  const handleAddIngredient = () => { if (!editingPrep) return; const newIngredient: PrepIngredient = { ingredientId: '', ingredientName: '', quantity: 0 }; setEditingPrep({ ...editingPrep, ingredients: [...editingPrep.ingredients, newIngredient] }); };

  const handleRemoveIngredient = (index: number) => { if (!editingPrep) return; setEditingPrep({ ...editingPrep, ingredients: editingPrep.ingredients.filter((_, i) => i !== index) }); };

  const handleIngredientChange = (index: number, field: keyof PrepIngredient, value: string | number) => {
    if (!editingPrep) return; const updated = [...editingPrep.ingredients]; updated[index] = { ...updated[index], [field]: value };
    if (field === 'ingredientId') { const ingredient = ingredients.find(i => i.id === value); if (ingredient) updated[index].ingredientName = ingredient.name; }
    setEditingPrep({ ...editingPrep, ingredients: updated });
  };

  // CSV helper
  const parseCsvLine = (line: string): string[] => {
    const res: string[] = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { inQuotes = !inQuotes; continue; } if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; continue; } cur += ch; }
    res.push(cur); return res.map(s => s.replace(/\uFEFF/g, '').trim());
  };
  const normalizeField = (s?: string) => (s || '').replace(/\uFEFF/g, '').replace(/^"|"$/g, '').trim();

  // CSV 업로드: 같은 프렙/소스명은 하나로 합치고, 누락 재료는 자동 생성(중복시 확인)
  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) { alert('CSV 파일 형식이 올바르지 않습니다.'); return; }

      const dataLines = lines.slice(1);
      const existingIngredients = loadIngredients();
      const existingNameMap: Record<string, number> = {};
      existingIngredients.forEach((ing, i) => { existingNameMap[(ing.name || '').toLowerCase()] = i; });

      const existingPreps = loadPreps();
      const existingPrepNameMap: Record<string, number> = {};
      existingPreps.forEach((p, i) => { existingPrepNameMap[(p.name || '').toLowerCase()] = i; });

      const items: CsvPreviewItem[] = [];

      dataLines.forEach((line, idx) => {
        const parts = parseCsvLine(line);
        const nameRaw = normalizeField(parts[0]);
        const ingredientNameRaw = normalizeField(parts[1]);
        const quantityStr = normalizeField(parts[2]);
        const replenishDatesRaw = parts.slice(3).map(normalizeField).filter(Boolean);
        const rowNumber = idx + 2;
        const parsed: Record<string, any> = { prepName: nameRaw, ingredientName: ingredientNameRaw, quantity: quantityStr, replenishDates: replenishDatesRaw };
        const validationErrors: string[] = [];
        if (!nameRaw) validationErrors.push('프렙/소스명 누락');
        if (!ingredientNameRaw) validationErrors.push('재료명 누락');
        if (quantityStr && isNaN(parseFloat(quantityStr))) validationErrors.push('투입량 숫자 형식 오류');

        const key = (nameRaw || '').toLowerCase();
        const matchedIndex = existingPrepNameMap.hasOwnProperty(key) ? existingPrepNameMap[key] : -1;
        const detectedMatch = matchedIndex >= 0
          ? { type: 'name_exact' as const, id: existingPreps[matchedIndex].id, existing: existingPreps[matchedIndex] }
          : undefined;
        const recommendedAction: CsvAction = detectedMatch ? 'merge' : 'create';

        // 자동 무시: 동일한 프렙/소스이 존재하고, 해당 프렙/소스이 이미 같은 재료/투입량을 포함하며 보충 날짜도 동일하면 미리보기에 추가하지 않음
        if (detectedMatch && detectedMatch.existing) {
          const exPrep = detectedMatch.existing as Prep;
          const qtyNum = parseFloat(String(parsed.quantity || '0') || '0');
          const ingredientMatch = exPrep.ingredients && exPrep.ingredients.some(ing => ((ing.ingredientName || '').toLowerCase() === (parsed.ingredientName || '').toString().toLowerCase()) && ing.quantity === qtyNum);
          const parsedDates = Array.isArray(parsed.replenishDates) ? parsed.replenishDates : (parsed.replenishDates ? [parsed.replenishDates] : []);
          const datesEqual = JSON.stringify((exPrep.replenishHistory || []).slice().sort()) === JSON.stringify((parsedDates || []).slice().sort());
          if (ingredientMatch && datesEqual) {
            // 완전 일치 → 자동 무시
            return;
          }
        }

        items.push({ rowNumber, raw: line, parsed, detectedMatch, recommendedAction, validationErrors });
      });

      setPreviewItems(items);
      setShowPreview(true);
    };
    reader.readAsText(file, 'UTF-8'); e.target.value = '';
  };

  const handleApplyPreview = (items: CsvPreviewItem[], actions: Record<number, CsvAction>) => {
    if (!items || items.length === 0) return;
    const result = applyPreviewActionsForPreps(items, actions);
    setShowPreview(false);
    setPreviewItems([]);
    loadData();
    alert(`${result.created || 0}개의 프렙/소스이 생성/병합되었습니다.`);
  };

  const handleResetPreps = () => { if (!confirm('정말 모든 프렙/소스을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return; if (!confirm('진짜로 초기화?')) return; savePreps([]); loadData(); alert('모든 프렙/소스이 초기화되었습니다.'); };

  const formatDate = (dateString?: string) => { if (!dateString) return '미설정'; const date = new Date(dateString); return date.toLocaleDateString('ko-KR'); };

  return (
    <div className="container">
      <h1>프렙/소스 관리</h1>
      <p>csv 구조 : 이름,재료명,투입량,보충날짜1(2025-12-20)..</p>
      <div className="actions" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <Button variant="primary" onClick={handleAddPrep}>프렙/소스 추가</Button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          CSV 업로드
          <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
        </label>
        <Button variant="secondary" onClick={() => exportPrepsToXlsx(preps)}>엑셀 내보내기</Button>
        <Button variant="secondary" onClick={() => exportPrepsToCsv(preps)}>CSV 내보내기</Button>
        <Button variant="danger" onClick={handleResetPreps} >프렙/소스 초기화</Button>
      </div>
      <CsvPreviewModal items={previewItems} open={showPreview} onClose={() => setShowPreview(false)} onApply={handleApplyPreview} />

      {showAddForm && editingPrep && (
        <Card title={editingPrep.id ? '프렙/소스 수정' : '프렙/소스 추가'}>
          <div className="form-row">
            <div className="input-group">
              <label>프렙/소스 이름</label>
              <Input
                value={editingPrep.name}
                onChange={(e) => setEditingPrep({ ...editingPrep, name: e.target.value })}
                placeholder="예: 오이피클"
                autoFocus
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
                <label>투입량</label>
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

          <div className="actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button variant="secondary" onClick={handleAddIngredient}>
              재료 추가
            </Button>
          </div>

          <div className="actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          <div className="empty-message">등록된 프렙/소스이 없습니다.</div>
        ) : (
          preps.map(prep => (
            <Card key={prep.id}>
              <div>
                {/* 카드 헤더 - 항상 표시 */}
                <div 
                  onClick={() => toggleExpand(prep.id)} 
                  style={{ 
                    cursor: 'pointer', 
                    padding: '1rem',
                    marginBottom: expandedPreps.has(prep.id) ? '1rem' : '0',
                    borderRadius: '8px',
                    background: expandedPreps.has(prep.id) ? 'transparent' : 'var(--bg)'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{prep.name}</h3>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <span>다음 보충 예상: {formatDate(prep.nextReplenishDate)}</span>
                    <span style={{ fontWeight: 'bold' }}>
                      총 재료 비용: {prep.totalCost.toLocaleString('ko-KR')}원
                    </span>
                  </div>
                </div>

                {/* 상세 정보 - 펼쳐졌을 때만 표시 */}
                {expandedPreps.has(prep.id) && (
                  <div>
                    <div className="subsection-title">보충 이력</div>
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
                              <th>투입량</th>
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
                                  <td>{prepIng.quantityText && String(prepIng.quantityText).trim() !== '' ? prepIng.quantityText : prepIng.quantity}</td>
                                  <td>{ingredient ? `${ingredient.unitPrice.toLocaleString('ko-KR')}원` : '-'}</td>
                                  <td>{itemTotal.toLocaleString('ko-KR')}원</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Button variant="secondary" onClick={() => handleEditPrep(prep)}>
                        수정
                      </Button>
                      <Button variant="danger" onClick={() => handleDeletePrep(prep.id)}>
                        삭제
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

