import { useState, useEffect } from 'react';
import type { CsvPreviewItem, CsvAction } from '../types';
import { Button } from './Button';

type Props = {
  items: CsvPreviewItem[];
  open: boolean;
  onClose: () => void;
  // onApply: pass back updated items and chosen actions
  onApply: (items: CsvPreviewItem[], actions: Record<number, CsvAction>) => void;
};

export function CsvPreviewModal({ items, open, onClose, onApply }: Props) {
  const [actions, setActions] = useState<Record<number, CsvAction>>(() => {
    const map: Record<number, CsvAction> = {};
    items.forEach(it => { map[it.rowNumber] = 'update'; });
    return map;
  });
  const [bulkAction, setBulkAction] = useState<CsvAction>('create');
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  useEffect(() => {
    // initialize selections when items change
    const sel: Record<number, boolean> = {};
    items.forEach(it => { sel[it.rowNumber] = true; });
    setSelected(sel);
    // reset actions defaults
    const act: Record<number, CsvAction> = {};
    items.forEach(it => { act[it.rowNumber] = 'update'; });
    setActions(act);
  }, [items]);

  if (!open) return null;

  const handleToggleAction = (row: number) => {
    setActions(prev => ({ ...prev, [row]: prev[row] === 'skip' ? 'update' : 'skip' }));
  };

  const toggleSelect = (row: number) => {
    setSelected(prev => ({ ...prev, [row]: !prev[row] }));
  };

  

  const handleApply = () => {
    // build updated items (no inline edits in simple view)
    onApply(items, actions);
  };

  // compute max left label width (in characters) across all items' ingredient lines
  const computeLeftStringsFromItem = (it: CsvPreviewItem): string[] => {
    const lefts: string[] = [];
    // existing
    if (it.detectedMatch && it.detectedMatch.existing) {
      const ex = it.detectedMatch.existing as any;
      if (ex.ingredients && Array.isArray(ex.ingredients) && ex.ingredients.length > 0) {
        ex.ingredients.forEach((ing: any) => lefts.push(`재료 : ${String(ing.ingredientName || ing.name || ing.ingredient || '')}`));
      } else if (ex.name) {
        lefts.push(`프렙/소스명 : ${String(ex.name)}`);
      }
      if (ex.name && ex.purchaseUnit !== undefined) {
        // ingredient object
        lefts.push(`재료 : ${String(ex.name)}`);
      }
    }

    // parsed
    const parsed = it.parsed || {};
    const ingName = parsed.ingredientName || parsed.name || parsed['ingredientName'] || parsed['ingredient'];
    if (ingName) {
      lefts.push(`재료 : ${String(ingName)}`);
    } else if (parsed.prepName || parsed.name) {
      lefts.push(`프렙/소스명 : ${String(parsed.prepName || parsed.name)}`);
    }

    return lefts;
  };

  const maxLeftChars = items.reduce((max, it) => {
    const arr = computeLeftStringsFromItem(it);
    arr.forEach(s => { if (s.length > max) max = s.length; });
    return max;
  }, 0);

  function renderParsedSummary(parsed?: Record<string, any>) {
    if (!parsed) return null;
    // detect ingredient-style parsed (name, price, purchaseUnit)
    const ingName = parsed.name || parsed.ingredientName || parsed['ingredientName'];
    const price = parsed.price || parsed.unitPrice || parsed['price'];
    const purchaseUnit = parsed.purchaseUnit || parsed['purchaseUnit'];

    if (ingName && (price !== undefined || purchaseUnit !== undefined)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${maxLeftChars}ch auto`, gap: '9ch', alignItems: 'center' }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>재료 :</strong> {ingName}</div>
            {price !== undefined ? <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>구매 가격 :</strong> {price}</div> : <div />}
          </div>
          {purchaseUnit !== undefined ? <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>구매 단위 :</strong> {purchaseUnit}</div> : null}
        </div>
      );
    }

    // otherwise treat as prep-style parsed
    const pName = parsed.prepName || parsed.name || parsed['prepName'];
    const iName = parsed.ingredientName || parsed['ingredientName'] || parsed['ingredient'];
    const qty = parsed.quantity || parsed.qty || parsed['수량'];
    const dates = parsed.replenishDates || parsed.replenish || parsed['replenishDates'];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pName ? <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>프렙/소스명 :</strong> {pName}</div> : null}
        {iName || qty ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `${maxLeftChars}ch auto`, gap: '9ch', alignItems: 'center' }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>재료 :</strong> {iName}</div>
              {qty !== undefined && qty !== '' ? <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>투입량 :</strong> {qty}</div> : <div />}
            </div>
          </div>
        ) : null}
        {dates && Array.isArray(dates) && dates.length ? <div style={{ color: '#666', fontSize: 12 }}>보충: {dates.join(', ')}</div> : null}
      </div>
    );
  }

  function renderExistingSummary(existing: any) {
    if (!existing) return null;
    // Ingredient existing
    if (existing.hasOwnProperty('purchaseUnit') || existing.hasOwnProperty('unitPrice')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>재료 :</strong> {existing.name}</div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>구매 가격 :</strong> {existing.price}</div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>구매 단위 :</strong> {existing.purchaseUnit}</div>
        </div>
      );
    }

    // Prep existing
    if (existing.hasOwnProperty('ingredients')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>프렙/소스명 :</strong> {existing.name}</div>
          {Array.isArray(existing.ingredients) && existing.ingredients.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {existing.ingredients.map((ing: any, idx: number) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: `${maxLeftChars}ch auto`, gap: '9ch', alignItems: 'center' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>재료 :</strong> {ing.ingredientName || ing.name || ing.ingredient}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>투입량 :</strong> {ing.quantity}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#666' }}>현재 없음</div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ width: '90%', maxWidth: 1000, maxHeight: '80vh', overflow: 'auto', background: 'white', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>CSV 업로드 미리보기</h3>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button variant="primary" onClick={handleApply}>선택 적용</Button>
            </div>
        </div>
        <div style={{ marginBottom: 8, color: '#555' }}>총 항목: {items.length}</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#555' }}>행 수: {items.length}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as CsvAction)}>
                <option value="update">모두 갱신</option>
                <option value="skip">모두 무시</option>
              </select>
              <Button variant="secondary" onClick={() => { const m: Record<number, CsvAction> = {}; items.forEach(it => { m[it.rowNumber] = bulkAction; }); setActions(prev => ({ ...prev, ...m })); }}>모두 적용</Button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', width: 40 }}>#</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>원본 아이템</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>추가 시도 아이템</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', width: 140 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.rowNumber} style={{ background: selected[it.rowNumber] ? 'rgba(59,130,246,0.03)' : 'transparent' }}>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                    <input type="checkbox" checked={!!selected[it.rowNumber]} onChange={() => toggleSelect(it.rowNumber)} />
                    <div style={{ marginTop: 6 }}>{it.rowNumber}</div>
                  </td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top', maxWidth: 320, wordBreak: 'break-word' }}>
                    {it.detectedMatch && it.detectedMatch.existing ? renderExistingSummary(it.detectedMatch.existing) : <div style={{ color: '#666' }}>현재 없음</div>}
                  </td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top', wordBreak: 'break-word' }}>{renderParsedSummary(it.parsed)}</td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                    <button onClick={() => handleToggleAction(it.rowNumber)} style={{ padding: '6px 10px', cursor: 'pointer' }}>
                      {actions[it.rowNumber] === 'skip' ? '무시' : '갱신'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={handleApply}>선택 적용</Button>
        </div>
      </div>
    </div>
  );
}

export default CsvPreviewModal;
