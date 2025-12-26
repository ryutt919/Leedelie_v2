import { useState, useEffect, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadPreps, savePreps, deletePrep, loadIngredients, saveIngredients } from '../storage';
import { exportPrepsToXlsx, exportPrepsToCsv } from '../generator';
import type { Prep, PrepIngredient, Ingredient } from '../types';

export function PrepManagementPage() {
  const [preps, setPreps] = useState<Prep[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [expandedPreps, setExpandedPreps] = useState<Set<string>>(new Set());
  const [editingPrep, setEditingPrep] = useState<Prep | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // modals & temp upload state
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [ingredientModalItems, setIngredientModalItems] = useState<string[]>([]);
  const [ingredientModalChoices, setIngredientModalChoices] = useState<Record<string, 'overwrite' | 'keep'>>({});

  const [prepConflictModalOpen, setPrepConflictModalOpen] = useState(false);
  const [prepConflictItems, setPrepConflictItems] = useState<string[]>([]);
  const [prepConflictChoices, setPrepConflictChoices] = useState<Record<string, 'merge' | 'overwrite' | 'skip'>>({});

  const [uploadTemp, setUploadTemp] = useState<any>(null);

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

  const toggleExpand = (prepId: string) => { const newSet = new Set(expandedPreps); newSet.has(prepId) ? newSet.delete(prepId) : newSet.add(prepId); setExpandedPreps(newSet); };

  const calculateAverageReplenishInterval = (replenishHistory: string[]): number | null => {
    if (!replenishHistory || replenishHistory.length < 2) return null;
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
    if (!editingPrep || !editingPrep.name.trim()) { alert('프렙 이름을 입력해주세요.'); return; }
    const totalCost = calculateTotalCost(editingPrep.ingredients);
    const expectedDate = calculateExpectedReplenishDate(editingPrep);
    const prepToSave: Prep = { ...editingPrep, totalCost, nextReplenishDate: expectedDate || undefined, updatedAt: new Date().toISOString() };
    const existingPreps = loadPreps();
    const idx = existingPreps.findIndex(p => p.id === prepToSave.id);
    if (idx >= 0) existingPreps[idx] = prepToSave; else existingPreps.push(prepToSave);
    savePreps(existingPreps); loadData(); setShowAddForm(false); setEditingPrep(null);
  };

  const handleDeletePrep = (id: string) => { if (confirm('정말 삭제하시겠습니까?')) { deletePrep(id); loadData(); } };

  const normalizeField = (s?: string) => (s || '').replace(/\uFEFF/g, '').replace(/^"|"$/g, '').trim();

  // CSV upload using PapaParse
  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data as any[]).filter(r => Array.isArray(r) && r.length > 0) as string[][];
        if (rows.length < 2) { alert('CSV 파일 형식이 올바르지 않습니다.'); return; }

        const dataRows = rows.slice(1);
        const existingPreps = loadPreps();
        const currentIngredients = loadIngredients();
        const ingredientList: Ingredient[] = [...currentIngredients];
        const failures: string[] = [];
        let idCounter = Date.now();

        const prepMap = new Map<string, { name: string; ingredients: PrepIngredient[]; replenishSet: Set<string>; createdAt: string; updatedAt: string; }>();
        const ingredientDuplicates: string[] = [];
        const prepConflicts: string[] = [];

        dataRows.forEach((row, idx) => {
          const parts = row.map(c => String(c || '').trim());
          if (parts.length < 3) { failures.push(`행 ${idx + 2}: 필드 수 부족`); return; }
          const nameRaw = normalizeField(parts[0]);
          const ingredientNameRaw = normalizeField(parts[1]);
          const quantityStr = normalizeField(parts[2]);
          const replenishDatesRaw = parts.slice(3).map(normalizeField).filter(Boolean);
          if (!nameRaw || !ingredientNameRaw) { failures.push(`행 ${idx + 2}: 이름 또는 재료명 누락`); return; }

          // ingredient duplicate check (case-insensitive)
          const foundExact = ingredientList.find(ing => ing.name === ingredientNameRaw);
          const foundCi = ingredientList.find(ing => ing.name.toLowerCase() === ingredientNameRaw.toLowerCase());
          if (!foundExact && foundCi && !ingredientDuplicates.includes(ingredientNameRaw)) ingredientDuplicates.push(ingredientNameRaw);

          // prep conflict
          if (existingPreps.find(p => p.name === nameRaw) && !prepConflicts.includes(nameRaw)) prepConflicts.push(nameRaw);

          // ensure ingredient exists (create placeholder if missing)
          let ingredient = ingredientList.find(ing => ing.name === ingredientNameRaw) || ingredientList.find(ing => ing.name.toLowerCase() === ingredientNameRaw.toLowerCase());
          if (!ingredient) { idCounter += 1; ingredient = { id: String(idCounter), name: ingredientNameRaw, price: 0, purchaseUnit: 1, unitPrice: 0 }; ingredientList.push(ingredient); }

          const quantity = parseFloat(quantityStr || '0');
          let entry = prepMap.get(nameRaw);
          if (!entry) { entry = { name: nameRaw, ingredients: [], replenishSet: new Set<string>(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; prepMap.set(nameRaw, entry); }
          const existingPi = entry.ingredients.find(pi => pi.ingredientId === ingredient!.id);
          if (existingPi) existingPi.quantity = (existingPi.quantity || 0) + quantity; else entry.ingredients.push({ ingredientId: ingredient!.id, ingredientName: ingredient!.name, quantity });
          replenishDatesRaw.forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) entry!.replenishSet.add(d); });
        });

        // store temp
        setUploadTemp({ prepMap, ingredientList, existingPreps, failures });

        if (ingredientDuplicates.length > 0) {
          const defaults: Record<string, 'overwrite' | 'keep'> = {};
          ingredientDuplicates.forEach(n => defaults[n] = 'keep');
          setIngredientModalItems(ingredientDuplicates);
          setIngredientModalChoices(defaults);
          setIngredientModalOpen(true);
          return;
        }

        if (prepConflicts.length > 0) {
          const defaults: Record<string, 'merge' | 'overwrite' | 'skip'> = {};
          prepConflicts.forEach(n => defaults[n] = 'merge');
          setPrepConflictItems(prepConflicts);
          setPrepConflictChoices(defaults);
          setPrepConflictModalOpen(true);
          return;
        }

        // finalize if no modals needed
        finalizeUpload({ prepMap, ingredientList, existingPreps, failures });
      }
    });
    e.target.value = '';
  };

  const finalizeUpload = ({ prepMap, ingredientList, existingPreps, failures }: any) => {
    const newPreps: Prep[] = Array.from(prepMap.entries()).map(([name, p]) => {
      const replenishHistory = Array.from(p.replenishSet).sort();
      const totalCost = calculateTotalCostForPrep(p.ingredients, ingredientList);
      return { id: String(Date.now() + Math.random()), name, ingredients: p.ingredients, replenishHistory, nextReplenishDate: calculateExpectedReplenishDate({ id: '', name, ingredients: p.ingredients, replenishHistory, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt }) || undefined, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt } as Prep;
    });

    saveIngredients(ingredientList);
    savePreps([...existingPreps, ...newPreps]);
    loadData();
    const successCount = newPreps.length;
    if (!failures || failures.length === 0) alert(`${successCount}개의 프렙이 추가되었습니다.`); else alert(`${successCount}개 추가, ${failures.length}개 실패:\n${failures.slice(0,5).join('\n')}`);
    setUploadTemp(null);
  };

  // ingredient modal confirm
  const onConfirmIngredientModal = () => {
    if (!uploadTemp) return;
    const { prepMap, ingredientList, existingPreps, failures } = uploadTemp;
    // apply choices
    ingredientModalItems.forEach(name => {
      const choice = ingredientModalChoices[name];
      const existing = ingredientList.find(ing => ing.name.toLowerCase() === name.toLowerCase());
      if (existing && choice === 'overwrite') {
        existing.name = name;
        existing.price = 0 as any; existing.purchaseUnit = 1 as any; existing.unitPrice = 0 as any;
      }
    });
    setIngredientModalOpen(false);
    // after ingredient handling, if there are prep conflicts, open prep modal
    const prepConflicts = Object.keys(prepConflictChoices).length ? Object.keys(prepConflictChoices) : [];
    if (prepConflicts.length > 0) { setPrepConflictModalOpen(true); return; }
    finalizeUpload({ prepMap, ingredientList, existingPreps, failures });
  };

  // prep conflict modal confirm
  const onConfirmPrepConflictModal = () => {
    if (!uploadTemp) return;
    const { prepMap, ingredientList, existingPreps, failures } = uploadTemp;
    const updatedPreps = [...existingPreps];
    Array.from(prepMap.entries()).forEach(([name, p]) => {
      const newPrep: Prep = { id: String(Date.now() + Math.random()), name, ingredients: p.ingredients, replenishHistory: Array.from(p.replenishSet).sort(), totalCost: calculateTotalCostForPrep(p.ingredients, ingredientList), createdAt: p.createdAt, updatedAt: p.updatedAt } as Prep;
      const existIdx = updatedPreps.findIndex(ep => ep.name === name);
      const choice = prepConflictChoices[name] || 'merge';
      if (existIdx >= 0) {
        if (choice === 'overwrite') {
          updatedPreps[existIdx] = { ...newPrep, id: updatedPreps[existIdx].id, updatedAt: new Date().toISOString() };
        } else if (choice === 'merge') {
          const exist = updatedPreps[existIdx];
          // merge ingredients
          const mapIng: Record<string, PrepIngredient> = {};
          exist.ingredients.forEach(pi => { mapIng[pi.ingredientId] = { ...pi }; });
          p.ingredients.forEach(pi => { if (mapIng[pi.ingredientId]) { mapIng[pi.ingredientId].quantity += pi.quantity; } else { mapIng[pi.ingredientId] = { ...pi }; } });
          const mergedIngredients = Object.values(mapIng);
          // merge replenishHistory
          const setDates = new Set<string>([...(exist.replenishHistory || []), ...Array.from(p.replenishSet)]);
          exist.ingredients = mergedIngredients;
          exist.replenishHistory = Array.from(setDates).sort();
          exist.totalCost = calculateTotalCostForPrep(mergedIngredients, ingredientList);
          exist.updatedAt = new Date().toISOString();
          updatedPreps[existIdx] = exist;
        } else if (choice === 'skip') {
          // do nothing
        }
      } else {
        updatedPreps.push(newPrep);
      }
    });

    saveIngredients(ingredientList);
    savePreps(updatedPreps);
    loadData();
    setPrepConflictModalOpen(false);
    setUploadTemp(null);
    alert('CSV 업로드가 완료되었습니다.');
  };

  // UI render
  return (
    <div className="container">
      <h1>프렙 관리</h1>
      <p>csv 구조 : 이름,재료명,수량,보충날짜1(2025-12-20)..</p>
      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddPrep}>프렙 추가</Button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer', marginLeft: 8 }}>
          CSV 업로드
          <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
        </label>
        <Button variant="secondary" onClick={() => exportPrepsToXlsx(preps)} style={{ marginLeft: 8 }}>엑셀 내보내기</Button>
        <Button variant="secondary" onClick={() => exportPrepsToCsv(preps)} style={{ marginLeft: 8 }}>CSV 내보내기</Button>
      </div>

      {ingredientModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 600 }}>
            <h3>재료 중복 확인</h3>
            <p>다음 재료명이 대소문자만 다른 기존 재료와 중복됩니다. 각 항목에 대해 동작을 선택하세요.</p>
            <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
              {ingredientModalItems.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>{name}</div>
                  <div>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`ing-${name}`} checked={ingredientModalChoices[name] === 'keep'} onChange={() => setIngredientModalChoices({ ...ingredientModalChoices, [name]: 'keep' })} /> 유지
                    </label>
                    <label>
                      <input type="radio" name={`ing-${name}`} checked={ingredientModalChoices[name] === 'overwrite'} onChange={() => setIngredientModalChoices({ ...ingredientModalChoices, [name]: 'overwrite' })} /> 덮어쓰기
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setIngredientModalOpen(false)}>취소</Button>
              <Button variant="primary" onClick={onConfirmIngredientModal} style={{ marginLeft: 8 }}>확인</Button>
            </div>
          </div>
        </div>
      )}

      {prepConflictModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 700 }}>
            <h3>프렙 충돌 처리</h3>
            <p>기존에 등록된 같은 이름의 프렙이 있습니다. 각 항목별로 처리 방법을 선택하세요.</p>
            <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
              {prepConflictItems.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>{name}</div>
                  <div>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'merge'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'merge' })} /> 병합
                    </label>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'overwrite'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'overwrite' })} /> 덮어쓰기
                    </label>
                    <label>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'skip'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'skip' })} /> 건너뛰기
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setPrepConflictModalOpen(false)}>취소</Button>
              <Button variant="primary" onClick={onConfirmPrepConflictModal} style={{ marginLeft: 8 }}>확인</Button>
            </div>
          </div>
        </div>
      )}

      <div className="schedules-list">
        {preps.length === 0 ? (
          <div className="empty-message">등록된 프렙이 없습니다.</div>
        ) : (
          preps.map(prep => (
            <Card key={prep.id}>
              <div>
                <div onClick={() => toggleExpand(prep.id)} style={{ cursor: 'pointer', padding: '1rem', marginBottom: expandedPreps.has(prep.id) ? '1rem' : '0', borderRadius: '8px', background: expandedPreps.has(prep.id) ? 'transparent' : 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{prep.name}</h3>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <span>다음 보충 예상 날짜: {prep.nextReplenishDate ? new Date(prep.nextReplenishDate).toLocaleDateString('ko-KR') : '미설정'}</span>
                    <span style={{ fontWeight: 'bold' }}>프렙 총 재료 비용: {prep.totalCost.toLocaleString('ko-KR')}원</span>
                  </div>
                </div>

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
                                <span>{new Date(date).toLocaleDateString('ko-KR')}</span>
                              </div>
                            ))}
                          </div>
                          {prep.replenishHistory.length >= 2 && (
                            <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>평균 보충 간격: {calculateAverageReplenishInterval(prep.replenishHistory)}일</div>
                          )}
                        </div>
                      )}
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
                      <Button variant="secondary" onClick={() => handleEditPrep(prep)}>수정</Button>
                      <Button variant="danger" onClick={() => handleDeletePrep(prep.id)} style={{ marginLeft: 8 }}>삭제</Button>
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
import { useState, useEffect, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadPreps, savePreps, deletePrep, loadIngredients, saveIngredients } from '../storage';
import { exportPrepsToXlsx, exportPrepsToCsv } from '../generator';
import type { Prep, PrepIngredient, Ingredient } from '../types';

export function PrepManagementPage() {
  const [preps, setPreps] = useState<Prep[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [expandedPreps, setExpandedPreps] = useState<Set<string>>(new Set());
  const [editingPrep, setEditingPrep] = useState<Prep | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // modals & temp upload state
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [ingredientModalItems, setIngredientModalItems] = useState<string[]>([]);
  const [ingredientModalChoices, setIngredientModalChoices] = useState<Record<string, 'overwrite' | 'keep'>>({});

  const [prepConflictModalOpen, setPrepConflictModalOpen] = useState(false);
  const [prepConflictItems, setPrepConflictItems] = useState<string[]>([]);
  const [prepConflictChoices, setPrepConflictChoices] = useState<Record<string, 'merge' | 'overwrite' | 'skip'>>({});

  const [uploadTemp, setUploadTemp] = useState<any>(null);

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

  const toggleExpand = (prepId: string) => { const newSet = new Set(expandedPreps); newSet.has(prepId) ? newSet.delete(prepId) : newSet.add(prepId); setExpandedPreps(newSet); };

  const calculateAverageReplenishInterval = (replenishHistory: string[]): number | null => {
    if (!replenishHistory || replenishHistory.length < 2) return null;
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
    if (!editingPrep || !editingPrep.name.trim()) { alert('프렙 이름을 입력해주세요.'); return; }
    const totalCost = calculateTotalCost(editingPrep.ingredients);
    const expectedDate = calculateExpectedReplenishDate(editingPrep);
    const prepToSave: Prep = { ...editingPrep, totalCost, nextReplenishDate: expectedDate || undefined, updatedAt: new Date().toISOString() };
    const existingPreps = loadPreps();
    const idx = existingPreps.findIndex(p => p.id === prepToSave.id);
    if (idx >= 0) existingPreps[idx] = prepToSave; else existingPreps.push(prepToSave);
    savePreps(existingPreps); loadData(); setShowAddForm(false); setEditingPrep(null);
  };

  const handleDeletePrep = (id: string) => { if (confirm('정말 삭제하시겠습니까?')) { deletePrep(id); loadData(); } };

  const normalizeField = (s?: string) => (s || '').replace(/\uFEFF/g, '').replace(/^"|"$/g, '').trim();

  // CSV upload using PapaParse
  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data as any[]).filter(r => Array.isArray(r) && r.length > 0) as string[][];
        if (rows.length < 2) { alert('CSV 파일 형식이 올바르지 않습니다.'); return; }

        const dataRows = rows.slice(1);
        const existingPreps = loadPreps();
        const currentIngredients = loadIngredients();
        const ingredientList: Ingredient[] = [...currentIngredients];
        const failures: string[] = [];
        let idCounter = Date.now();

        const prepMap = new Map<string, { name: string; ingredients: PrepIngredient[]; replenishSet: Set<string>; createdAt: string; updatedAt: string; }>();
        const ingredientDuplicates: string[] = [];
        const prepConflicts: string[] = [];

        dataRows.forEach((row, idx) => {
          const parts = row.map(c => String(c || '').trim());
          if (parts.length < 3) { failures.push(`행 ${idx + 2}: 필드 수 부족`); return; }
          const nameRaw = normalizeField(parts[0]);
          const ingredientNameRaw = normalizeField(parts[1]);
          const quantityStr = normalizeField(parts[2]);
          const replenishDatesRaw = parts.slice(3).map(normalizeField).filter(Boolean);
          if (!nameRaw || !ingredientNameRaw) { failures.push(`행 ${idx + 2}: 이름 또는 재료명 누락`); return; }

          // ingredient duplicate check (case-insensitive)
          const foundExact = ingredientList.find(ing => ing.name === ingredientNameRaw);
          const foundCi = ingredientList.find(ing => ing.name.toLowerCase() === ingredientNameRaw.toLowerCase());
          if (!foundExact && foundCi && !ingredientDuplicates.includes(ingredientNameRaw)) ingredientDuplicates.push(ingredientNameRaw);

          // prep conflict
          if (existingPreps.find(p => p.name === nameRaw) && !prepConflicts.includes(nameRaw)) prepConflicts.push(nameRaw);

          // ensure ingredient exists (create placeholder if missing)
          let ingredient = ingredientList.find(ing => ing.name === ingredientNameRaw) || ingredientList.find(ing => ing.name.toLowerCase() === ingredientNameRaw.toLowerCase());
          if (!ingredient) { idCounter += 1; ingredient = { id: String(idCounter), name: ingredientNameRaw, price: 0, purchaseUnit: 1, unitPrice: 0 }; ingredientList.push(ingredient); }

          const quantity = parseFloat(quantityStr || '0');
          let entry = prepMap.get(nameRaw);
          if (!entry) { entry = { name: nameRaw, ingredients: [], replenishSet: new Set<string>(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; prepMap.set(nameRaw, entry); }
          const existingPi = entry.ingredients.find(pi => pi.ingredientId === ingredient!.id);
          if (existingPi) existingPi.quantity = (existingPi.quantity || 0) + quantity; else entry.ingredients.push({ ingredientId: ingredient!.id, ingredientName: ingredient!.name, quantity });
          replenishDatesRaw.forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) entry!.replenishSet.add(d); });
        });

        // store temp
        setUploadTemp({ prepMap, ingredientList, existingPreps, failures });

        if (ingredientDuplicates.length > 0) {
          const defaults: Record<string, 'overwrite' | 'keep'> = {};
          ingredientDuplicates.forEach(n => defaults[n] = 'keep');
          setIngredientModalItems(ingredientDuplicates);
          setIngredientModalChoices(defaults);
          setIngredientModalOpen(true);
          return;
        }

        if (prepConflicts.length > 0) {
          const defaults: Record<string, 'merge' | 'overwrite' | 'skip'> = {};
          prepConflicts.forEach(n => defaults[n] = 'merge');
          setPrepConflictItems(prepConflicts);
          setPrepConflictChoices(defaults);
          setPrepConflictModalOpen(true);
          return;
        }

        // finalize if no modals needed
        finalizeUpload({ prepMap, ingredientList, existingPreps, failures });
      }
    });
    e.target.value = '';
  };

  const finalizeUpload = ({ prepMap, ingredientList, existingPreps, failures }: any) => {
    const newPreps: Prep[] = Array.from(prepMap.entries()).map(([name, p]) => {
      const replenishHistory = Array.from(p.replenishSet).sort();
      const totalCost = calculateTotalCostForPrep(p.ingredients, ingredientList);
      return { id: String(Date.now() + Math.random()), name, ingredients: p.ingredients, replenishHistory, nextReplenishDate: calculateExpectedReplenishDate({ id: '', name, ingredients: p.ingredients, replenishHistory, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt }) || undefined, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt } as Prep;
    });

    saveIngredients(ingredientList);
    savePreps([...existingPreps, ...newPreps]);
    loadData();
    const successCount = newPreps.length;
    if (!failures || failures.length === 0) alert(`${successCount}개의 프렙이 추가되었습니다.`); else alert(`${successCount}개 추가, ${failures.length}개 실패:\n${failures.slice(0,5).join('\n')}`);
    setUploadTemp(null);
  };

  // ingredient modal confirm
  const onConfirmIngredientModal = () => {
    if (!uploadTemp) return;
    const { prepMap, ingredientList, existingPreps, failures } = uploadTemp;
    // apply choices
    ingredientModalItems.forEach(name => {
      const choice = ingredientModalChoices[name];
      const existing = ingredientList.find(ing => ing.name.toLowerCase() === name.toLowerCase());
      if (existing && choice === 'overwrite') {
        existing.name = name;
        existing.price = 0 as any; existing.purchaseUnit = 1 as any; existing.unitPrice = 0 as any;
      }
    });
    setIngredientModalOpen(false);
    // after ingredient handling, if there are prep conflicts, open prep modal
    const prepConflicts = Object.keys(prepConflictChoices).length ? Object.keys(prepConflictChoices) : [];
    if (prepConflicts.length > 0) { setPrepConflictModalOpen(true); return; }
    finalizeUpload({ prepMap, ingredientList, existingPreps, failures });
  };

  // prep conflict modal confirm
  const onConfirmPrepConflictModal = () => {
    if (!uploadTemp) return;
    const { prepMap, ingredientList, existingPreps, failures } = uploadTemp;
    const updatedPreps = [...existingPreps];
    Array.from(prepMap.entries()).forEach(([name, p]) => {
      const newPrep: Prep = { id: String(Date.now() + Math.random()), name, ingredients: p.ingredients, replenishHistory: Array.from(p.replenishSet).sort(), totalCost: calculateTotalCostForPrep(p.ingredients, ingredientList), createdAt: p.createdAt, updatedAt: p.updatedAt } as Prep;
      const existIdx = updatedPreps.findIndex(ep => ep.name === name);
      const choice = prepConflictChoices[name] || 'merge';
      if (existIdx >= 0) {
        if (choice === 'overwrite') {
          updatedPreps[existIdx] = { ...newPrep, id: updatedPreps[existIdx].id, updatedAt: new Date().toISOString() };
        } else if (choice === 'merge') {
          const exist = updatedPreps[existIdx];
          // merge ingredients
          const mapIng: Record<string, PrepIngredient> = {};
          exist.ingredients.forEach(pi => { mapIng[pi.ingredientId] = { ...pi }; });
          p.ingredients.forEach(pi => { if (mapIng[pi.ingredientId]) { mapIng[pi.ingredientId].quantity += pi.quantity; } else { mapIng[pi.ingredientId] = { ...pi }; } });
          const mergedIngredients = Object.values(mapIng);
          // merge replenishHistory
          const setDates = new Set<string>([...(exist.replenishHistory || []), ...Array.from(p.replenishSet)]);
          exist.ingredients = mergedIngredients;
          exist.replenishHistory = Array.from(setDates).sort();
          exist.totalCost = calculateTotalCostForPrep(mergedIngredients, ingredientList);
          exist.updatedAt = new Date().toISOString();
          updatedPreps[existIdx] = exist;
        } else if (choice === 'skip') {
          // do nothing
        }
      } else {
        updatedPreps.push(newPrep);
      }
    });

    saveIngredients(ingredientList);
    savePreps(updatedPreps);
    loadData();
    setPrepConflictModalOpen(false);
    setUploadTemp(null);
    alert('CSV 업로드가 완료되었습니다.');
  };

  // UI render
  return (
    <div className="container">
      <h1>프렙 관리</h1>
      <p>csv 구조 : 이름,재료명,수량,보충날짜1(2025-12-20)..</p>
      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddPrep}>프렙 추가</Button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer', marginLeft: 8 }}>
          CSV 업로드
          <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
        </label>
        <Button variant="secondary" onClick={() => exportPrepsToXlsx(preps)} style={{ marginLeft: 8 }}>엑셀 내보내기</Button>
        <Button variant="secondary" onClick={() => exportPrepsToCsv(preps)} style={{ marginLeft: 8 }}>CSV 내보내기</Button>
      </div>

      {ingredientModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 600 }}>
            <h3>재료 중복 확인</h3>
            <p>다음 재료명이 대소문자만 다른 기존 재료와 중복됩니다. 각 항목에 대해 동작을 선택하세요.</p>
            <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
              {ingredientModalItems.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>{name}</div>
                  <div>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`ing-${name}`} checked={ingredientModalChoices[name] === 'keep'} onChange={() => setIngredientModalChoices({ ...ingredientModalChoices, [name]: 'keep' })} /> 유지
                    </label>
                    <label>
                      <input type="radio" name={`ing-${name}`} checked={ingredientModalChoices[name] === 'overwrite'} onChange={() => setIngredientModalChoices({ ...ingredientModalChoices, [name]: 'overwrite' })} /> 덮어쓰기
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setIngredientModalOpen(false)}>취소</Button>
              <Button variant="primary" onClick={onConfirmIngredientModal} style={{ marginLeft: 8 }}>확인</Button>
            </div>
          </div>
        </div>
      )}

      {prepConflictModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 700 }}>
            <h3>프렙 충돌 처리</h3>
            <p>기존에 등록된 같은 이름의 프렙이 있습니다. 각 항목별로 처리 방법을 선택하세요.</p>
            <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
              {prepConflictItems.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>{name}</div>
                  <div>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'merge'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'merge' })} /> 병합
                    </label>
                    <label style={{ marginRight: 8 }}>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'overwrite'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'overwrite' })} /> 덮어쓰기
                    </label>
                    <label>
                      <input type="radio" name={`prep-${name}`} checked={prepConflictChoices[name] === 'skip'} onChange={() => setPrepConflictChoices({ ...prepConflictChoices, [name]: 'skip' })} /> 건너뛰기
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setPrepConflictModalOpen(false)}>취소</Button>
              <Button variant="primary" onClick={onConfirmPrepConflictModal} style={{ marginLeft: 8 }}>확인</Button>
            </div>
          </div>
        </div>
      )}

      <div className="schedules-list">
        {preps.length === 0 ? (
          <div className="empty-message">등록된 프렙이 없습니다.</div>
        ) : (
          preps.map(prep => (
            <Card key={prep.id}>
              <div>
                <div onClick={() => toggleExpand(prep.id)} style={{ cursor: 'pointer', padding: '1rem', marginBottom: expandedPreps.has(prep.id) ? '1rem' : '0', borderRadius: '8px', background: expandedPreps.has(prep.id) ? 'transparent' : 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{prep.name}</h3>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <span>다음 보충 예상 날짜: {prep.nextReplenishDate ? new Date(prep.nextReplenishDate).toLocaleDateString('ko-KR') : '미설정'}</span>
                    <span style={{ fontWeight: 'bold' }}>프렙 총 재료 비용: {prep.totalCost.toLocaleString('ko-KR')}원</span>
                  </div>
                </div>

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
                                <span>{new Date(date).toLocaleDateString('ko-KR')}</span>
                              </div>
                            ))}
                          </div>
                          {prep.replenishHistory.length >= 2 && (
                            <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>평균 보충 간격: {calculateAverageReplenishInterval(prep.replenishHistory)}일</div>
                          )}
                        </div>
                      )}
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
                      <Button variant="secondary" onClick={() => handleEditPrep(prep)}>수정</Button>
                      <Button variant="danger" onClick={() => handleDeletePrep(prep.id)} style={{ marginLeft: 8 }}>삭제</Button>
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
import { useState, useEffect, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadPreps, savePreps, deletePrep } from '../storage';

import { exportPrepsToXlsx, exportPrepsToCsv } from '../generator';
import type { Prep, PrepIngredient, Ingredient } from '../types';

export function PrepManagementPage() {
  const [preps, setPreps] = useState<Prep[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [expandedPreps, setExpandedPreps] = useState<Set<string>>(new Set());
  const [editingPrep, setEditingPrep] = useState<Prep | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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
    if (!editingPrep || !editingPrep.name.trim()) { alert('프렙 이름을 입력해주세요.'); return; }
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

  // CSV 업로드: 같은 프렙명은 하나로 합치고, 누락 재료는 자동 생성(중복시 확인)
  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string; const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) { alert('CSV 파일 형식이 올바르지 않습니다.'); return; }
      const dataLines = lines.slice(1);
      const existingPreps = loadPreps(); const currentIngredients = loadIngredients(); const ingredientList: Ingredient[] = [...currentIngredients]; const failures: string[] = []; let idCounter = Date.now();

      const prepMap = new Map<string, { id: string; name: string; ingredients: PrepIngredient[]; replenishSet: Set<string>; createdAt: string; updatedAt: string; }>();

      dataLines.forEach((line, idx) => {
        const parts = parseCsvLine(line); if (parts.length < 3) { failures.push(`행 ${idx + 2}: 필드 수 부족`); return; }
        const nameRaw = normalizeField(parts[0]); const ingredientNameRaw = normalizeField(parts[1]); const quantityStr = normalizeField(parts[2]); const replenishDatesRaw = parts.slice(3).map(normalizeField).filter(Boolean);
        if (!nameRaw || !ingredientNameRaw) { failures.push(`행 ${idx + 2}: 이름 또는 재료명 누락`); return; }
        const quantity = parseFloat(quantityStr || '0');
        // ingredient find/create
        let ingredient = ingredientList.find(ing => ing.name === ingredientNameRaw);
        if (!ingredient) {
          const existingByName = ingredientList.find(ing => ing.name.toLowerCase() === ingredientNameRaw.toLowerCase());
          if (existingByName) {
            const doOverwrite = confirm(`재료 '${ingredientNameRaw}'이(가) 이미 존재합니다. 덮어쓰시겠습니까?`);
            if (doOverwrite) { existingByName.name = ingredientNameRaw; existingByName.price = 0 as any; existingByName.purchaseUnit = 1 as any; existingByName.unitPrice = 0 as any; ingredient = existingByName; } else { ingredient = existingByName; }
          } else {
            idCounter += 1; const newIng: Ingredient = { id: String(idCounter), name: ingredientNameRaw, price: 0, purchaseUnit: 1, unitPrice: 0 }; ingredientList.push(newIng); ingredient = newIng;
          }
        }

        let prepEntry = prepMap.get(nameRaw);
        if (!prepEntry) { prepEntry = { id: String(idCounter++), name: nameRaw, ingredients: [], replenishSet: new Set<string>(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; prepMap.set(nameRaw, prepEntry); }

        const existingPi = prepEntry.ingredients.find(pi => pi.ingredientId === ingredient.id);
        if (existingPi) existingPi.quantity = (existingPi.quantity || 0) + quantity; else prepEntry.ingredients.push({ ingredientId: ingredient.id, ingredientName: ingredient.name, quantity });
        replenishDatesRaw.forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) prepEntry!.replenishSet.add(d); });
      });

      const newPreps: Prep[] = Array.from(prepMap.values()).map(p => {
        const replenishHistory = Array.from(p.replenishSet).sort(); const totalCost = calculateTotalCostForPrep(p.ingredients, ingredientList);
        return { id: p.id, name: p.name, ingredients: p.ingredients, replenishHistory, nextReplenishDate: calculateExpectedReplenishDate({ id: p.id, name: p.name, ingredients: p.ingredients, replenishHistory, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt }) || undefined, totalCost, createdAt: p.createdAt, updatedAt: p.updatedAt } as Prep;
      });

      saveIngredients(ingredientList); savePreps([...existingPreps, ...newPreps]); loadData(); const successCount = newPreps.length; if (failures.length === 0) alert(`${successCount}개의 프렙이 추가되었습니다.`); else alert(`${successCount}개 추가, ${failures.length}개 실패:\n${failures.slice(0,5).join('\n')}`);
    };
    reader.readAsText(file, 'UTF-8'); e.target.value = '';
  };

  const handleResetPreps = () => { if (!confirm('정말 모든 프렙을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return; if (!confirm('진짜로 초기화?')) return; savePreps([]); loadData(); alert('모든 프렙이 초기화되었습니다.'); };
  const handleResetIngredients = () => { if (!confirm('정말 모든 재료를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return; if (!confirm('진짜로 초기화?')) return; saveIngredients([]); loadData(); alert('모든 재료가 초기화되었습니다.'); };

  const formatDate = (dateString?: string) => { if (!dateString) return '미설정'; const date = new Date(dateString); return date.toLocaleDateString('ko-KR'); };

  return (
    <div className="container">
      <h1>프렙 관리</h1>
      <p>csv 구조 : 이름,재료명,수량,보충날짜1(2025-12-20)..</p>
      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddPrep}>프렙 추가</Button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          CSV 업로드
          <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
        </label>
        <Button variant="secondary" onClick={() => exportPrepsToXlsx(preps)}>엑셀 내보내기</Button>
        <Button variant="secondary" onClick={() => exportPrepsToCsv(preps)}>CSV 내보내기</Button>
        <Button variant="danger" onClick={handleResetPreps} style={{ marginLeft: 8 }}>프렙 초기화</Button>
        <Button variant="danger" onClick={handleResetIngredients} style={{ marginLeft: 8 }}>재료 초기화</Button>
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
                    <span>다음 보충 예상 날짜: {formatDate(prep.nextReplenishDate)}</span>
                    <span style={{ fontWeight: 'bold' }}>
                      프렙 총 재료 비용: {prep.totalCost.toLocaleString('ko-KR')}원
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

