import { useState, useEffect, type ChangeEvent } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadIngredients, saveIngredients, deleteIngredient, loadPreps, savePreps, applyPreviewActionsForIngredients } from '../storage';
import CsvPreviewModal from '../components/CsvPreviewModal';
import type { CsvPreviewItem, CsvAction } from '../types';
import { exportIngredientsToXlsx, exportIngredientsToCsv } from '../generator';
import type { Ingredient } from '../types';

export function IngredientManagementPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [previewItems, setPreviewItems] = useState<CsvPreviewItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIngredients(loadIngredients());
  };

  const handleAddIngredient = () => {
    const newIngredient: Ingredient = {
      id: String(Date.now()),
      name: '',
      price: 0,
      purchaseUnit: 1,
      unitPrice: 0
    };
    setEditingIngredient(newIngredient);
    setShowAddForm(true);
  };

  const handleEditIngredient = (ingredient: Ingredient) => {
    setEditingIngredient({ ...ingredient });
    setShowAddForm(true);
  };

  const handleSaveIngredient = () => {
    if (!editingIngredient || !editingIngredient.name.trim()) {
      alert('재료 이름을 입력해주세요.');
      return;
    }
    if (editingIngredient.price < 0) {
      alert('가격은 0 이상이어야 합니다.');
      return;
    }
    if (editingIngredient.purchaseUnit <= 0) {
      alert('구매 단위는 0보다 커야 합니다.');
      return;
    }

    const unitPrice = editingIngredient.purchaseUnit > 0 
      ? editingIngredient.price / editingIngredient.purchaseUnit 
      : 0;

    const ingredientToSave: Ingredient = {
      ...editingIngredient,
      unitPrice
    };

    const existingIngredients = loadIngredients();
    const existingIndex = existingIngredients.findIndex(i => i.id === ingredientToSave.id);
    
    if (existingIndex >= 0) {
      existingIngredients[existingIndex] = ingredientToSave;
    } else {
      existingIngredients.push(ingredientToSave);
    }
    
    saveIngredients(existingIngredients);
    loadData();
    setShowAddForm(false);
    setEditingIngredient(null);
  };

  const handleDeleteIngredient = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deleteIngredient(id);
      loadData();
    }
  };

  const handleResetIngredients = async () => {
    if (!confirm('모든 재료를 초기화하시겠습니까?')) return;
    if (!confirm('정말로 모든 재료와 준비 목록의 재료를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    // 모든 재료 초기화
    saveIngredients([]);

    // 모든 prep의 재료 목록 초기화 및 비용 리셋
    const preps = loadPreps();
    const now = new Date().toISOString();
    const updatedPreps = preps.map(p => ({ ...p, ingredients: [], totalCost: 0, updatedAt: now }));
    savePreps(updatedPreps);

    loadData();
    alert('모든 재료와 준비 목록의 재료가 초기화되었습니다.');
  };

  const handleFieldChange = (field: keyof Ingredient, value: string | number) => {
    if (!editingIngredient) return;
    
    const updated = { ...editingIngredient, [field]: value };
    
    // price나 purchaseUnit이 변경되면 unitPrice 자동 계산
    if (field === 'price' || field === 'purchaseUnit') {
      const price = field === 'price' ? (value as number) : updated.price;
      const purchaseUnit = field === 'purchaseUnit' ? (value as number) : updated.purchaseUnit;
      updated.unitPrice = purchaseUnit > 0 ? price / purchaseUnit : 0;
    }
    
    setEditingIngredient(updated);
  };

  const handleCSVUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const parseCsvLine = (line: string): string[] => {
      const res: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; continue; }
        cur += ch;
      }
      res.push(cur);
      return res.map(s => s.replace(/\uFEFF/g, '').trim());
    };

    const normalizeField = (s?: string) => (s || '').replace(/\uFEFF/g, '').replace(/^"|"$/g, '').trim();
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        alert('CSV 파일 형식이 올바르지 않습니다.');
        return;
      }

      const dataLines = lines.slice(1);
      const existingIngredients = loadIngredients();
      const existingNameMap: Record<string, number> = {};
      existingIngredients.forEach((ing, i) => { existingNameMap[(ing.name || '').toLowerCase()] = i; });

      const items: CsvPreviewItem[] = [];

      dataLines.forEach((line, idx) => {
        const parts = parseCsvLine(line);
        const name = normalizeField(parts[0]);
        const priceStr = normalizeField(parts[1]);
        const purchaseUnitStr = normalizeField(parts[2]);

        const rowNumber = idx + 2; // header를 제외한 원본 행 번호
        const parsed: Record<string, string | number> = {
          name,
          price: priceStr || '',
          purchaseUnit: purchaseUnitStr || ''
        };

        const validationErrors: string[] = [];
        if (!name) validationErrors.push('이름 누락');
        const price = parseFloat(priceStr || '0');
        const purchaseUnit = parseFloat(purchaseUnitStr || '1');
        if (isNaN(price) || isNaN(purchaseUnit)) validationErrors.push('숫자 형식 오류');

        const key = (name || '').toLowerCase();
        const detectedMatch = existingNameMap.hasOwnProperty(key)
          ? { type: 'name_exact' as const, id: existingIngredients[existingNameMap[key]].id, existing: existingIngredients[existingNameMap[key]] }
          : undefined;
        const recommendedAction: CsvAction = detectedMatch ? 'update' : 'create';

        items.push({ rowNumber, raw: line, parsed, detectedMatch, recommendedAction, validationErrors });
      });

      setPreviewItems(items);
      setShowPreview(true);
    };

    reader.readAsText(file, 'UTF-8');
    e.target.value = ''; // 파일 input 초기화
  };

  const handleApplyPreview = (items: CsvPreviewItem[], actions: Record<number, CsvAction>) => {
    if (!items || items.length === 0) return;
    const result = applyPreviewActionsForIngredients(items, actions);
    setShowPreview(false);
    setPreviewItems([]);
    loadData();
    alert(`${result.created || 0}개 생성, ${result.updated || 0}개 갱신, ${result.skipped || 0}개 건너뜀`);
  };

  return (
    <div className="container">
      <h1>재료 관리</h1>
       <p>csv 구조 : 이름,가격,구매단위</p>
      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddIngredient}>
          재료 추가
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

        <Button variant="secondary" onClick={() => exportIngredientsToXlsx(ingredients)}>
          엑셀 내보내기
        </Button>
        <Button variant="secondary" onClick={() => exportIngredientsToCsv(ingredients)}>
          CSV 내보내기
        </Button>
        <Button variant="danger" onClick={handleResetIngredients}>
          재료 초기화
        </Button>
      </div>
      <CsvPreviewModal items={previewItems} open={showPreview} onClose={() => setShowPreview(false)} onApply={handleApplyPreview} />

      {showAddForm && editingIngredient && (
        <Card title={editingIngredient.id ? '재료 수정' : '재료 추가'}>
          <div className="form-row">
            <div className="input-group">
              <label>재료 이름</label>
              <Input
                value={editingIngredient.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="예: 오이"
              />
            </div>
            <div className="input-group">
              <label>구매 가격 (원)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={editingIngredient.price}
                onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-group">
              <label>구매 단위</label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={editingIngredient.purchaseUnit}
                onChange={(e) => handleFieldChange('purchaseUnit', parseFloat(e.target.value) || 1)}
                placeholder="예: 1 (1kg, 1개 등)"
              />
            </div>
            <div className="input-group">
              <label>단위 가격 (자동 계산)</label>
              <Input
                type="number"
                value={editingIngredient.unitPrice.toFixed(2)}
                disabled
                style={{ background: 'var(--bg)' }}
              />
            </div>
          </div>

          <div className="actions" style={{ marginTop: '1.5rem' }}>
            <Button variant="primary" onClick={handleSaveIngredient}>
              저장
            </Button>
            <Button variant="secondary" onClick={() => { setShowAddForm(false); setEditingIngredient(null); }}>
              취소
            </Button>
          </div>
        </Card>
      )}

      <div className="schedules-list">
        {ingredients.length === 0 ? (
          <div className="empty-message">등록된 재료가 없습니다.</div>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>재료명</th>
                  <th>구매 가격</th>
                  <th>구매 단위</th>
                  <th>단위 가격</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map(ingredient => (
                  <tr key={ingredient.id}>
                    <td>{ingredient.name}</td>
                    <td>{ingredient.price.toLocaleString('ko-KR')}원</td>
                    <td>{ingredient.purchaseUnit}</td>
                    <td>{ingredient.unitPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" onClick={() => handleEditIngredient(ingredient)}>
                          수정
                        </Button>
                        <Button variant="danger" onClick={() => handleDeleteIngredient(ingredient.id)}>
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

