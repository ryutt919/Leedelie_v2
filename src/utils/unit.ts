export function normalizeUnitLabel(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  // 엑셀 줄바꿈/캐리지리턴 흔적 제거
  s = s.replace(/_x000d_/gi, '').replace(/\r|\n/g, '').trim()
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

  // 숫자 앞에 텍스트가 있는 케이스: "약 10g", "대략10 g"
  // 문자열 어디에 있든 "첫 번째 숫자 토큰"을 amount로 사용하고, 그 뒤를 unit으로 본다.
  const firstNum = s.match(/([+-]?\d+(?:\.\d+)?)/)
  if (firstNum?.index !== undefined) {
    const amount = Number(firstNum[1])
    const after = s.slice(firstNum.index + firstNum[1].length).trim().replace(/\s+/g, '')
    if (Number.isFinite(amount)) {
      return { amount, unitLabel: normalizeUnitLabel(after) }
    }
  }

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


