import { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { loadIngredients, saveIngredient, deleteIngredient } from '../storage';
import type { Ingredient } from '../types';

export function IngredientManagementPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

    saveIngredient(ingredientToSave);
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

  return (
    <div className="container">
      <h1>재료 관리</h1>

      <div className="actions" style={{ marginBottom: '1.5rem' }}>
        <Button variant="primary" onClick={handleAddIngredient}>
          재료 추가
        </Button>
      </div>

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

