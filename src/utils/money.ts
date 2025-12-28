export function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function safeNumber(n: unknown, fallback = 0) {
  const x = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(x) ? x : fallback
}



