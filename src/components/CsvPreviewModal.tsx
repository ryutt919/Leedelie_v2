import { useState } from 'react';
import type { CsvPreviewItem, CsvAction } from '../types';
import { Button } from './Button';

type Props = {
  items: CsvPreviewItem[];
  open: boolean;
  onClose: () => void;
  onApply: (actions: Record<number, CsvAction>) => void;
};

export function CsvPreviewModal({ items, open, onClose, onApply }: Props) {
  const [actions, setActions] = useState<Record<number, CsvAction>>(() => {
    const map: Record<number, CsvAction> = {};
    items.forEach(it => { map[it.rowNumber] = 'create'; });
    return map;
  });
  const [bulkAction, setBulkAction] = useState<CsvAction>('create');

  if (!open) return null;

  const handleChange = (row: number, action: CsvAction) => {
    setActions(prev => ({ ...prev, [row]: action }));
  };

  const handleApply = () => {
    onApply(actions);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ width: '90%', maxWidth: 1000, maxHeight: '80vh', overflow: 'auto', background: 'white', borderRadius: 8, padding: 16 }}>
        <h3>CSV 업로드 미리보기</h3>
        <div style={{ marginBottom: 8 }}>행 수: {items.length}</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#555' }}>행 수: {items.length}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as CsvAction)}>
                <option value="create">모두 생성</option>
                <option value="update">모두 업데이트</option>
                <option value="merge">모두 합치기</option>
                <option value="skip">모두 건너뜀</option>
              </select>
              <Button variant="secondary" onClick={() => { const m: Record<number, CsvAction> = {}; items.forEach(it => { m[it.rowNumber] = bulkAction; }); setActions(m); }}>모두 적용</Button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', width: 40 }}>#</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>원본 행</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>파싱된 필드</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', width: 160 }}>검증</th>
                <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', width: 140 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.rowNumber}>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>{it.rowNumber}</td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.raw}</td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, color: '#333' }}>
                      {Object.entries(it.parsed || {}).map(([k, v]) => (
                        <div key={k}><strong>{k}: </strong>{Array.isArray(v) ? (v as any).join(';') : String(v)}</div>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top', color: it.validationErrors && it.validationErrors.length ? '#b91c1c' : '#6b7280' }}>
                    {it.validationErrors && it.validationErrors.length ? it.validationErrors.join(', ') : '정상'}
                  </td>
                  <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                    <select value={actions[it.rowNumber]} onChange={(e) => handleChange(it.rowNumber, e.target.value as CsvAction)}>
                      <option value="create">생성</option>
                      <option value="update">업데이트</option>
                      <option value="merge">합치기</option>
                      <option value="skip">추가 안함</option>
                    </select>
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
