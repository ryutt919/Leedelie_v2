export function normalizeUnitLabel(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  // 흔한 표현 통일
  const lower = s.toLowerCase()
  if (lower === 'ea') return '개'
  return s
}

export function parseAmountAndUnit(raw: unknown): { amount: number; unitLabel: string } {
  if (typeof raw === 'number') return { amount: raw, unitLabel: '' }

  let s = String(raw ?? '').trim()
  if (!s) return { amount: NaN, unitLabel: '' }

  // 1,000g 같은 케이스
  s = s.replace(/,/g, '')

  // 끝에 붙은 괄호/대괄호 메모 제거: "10장(1팩)" → "10장"
  s = s.replace(/\([^)]*\)\s*$/g, '').replace(/\[[^\]]*\]\s*$/g, '').trim()

  // "10 g", "10g", "10 개", "10장" 등: 마지막 토큰이 단위(한글/영문)인 케이스 우선 처리
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*([a-zA-Z가-힣]+)$/)
  if (m) {
    return { amount: Number(m[1]), unitLabel: normalizeUnitLabel(m[2]) }
  }

  // fallback: 앞 숫자만 파싱하고 나머지를 단위로
  const m2 = s.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/)
  if (m2) {
    const rest = (m2[2] ?? '').trim().replace(/\s+/g, '')
    return { amount: Number(m2[1]), unitLabel: normalizeUnitLabel(rest) }
  }

  return { amount: Number(s), unitLabel: '' }
}


