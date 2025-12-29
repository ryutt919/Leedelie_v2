import * as XLSX from 'xlsx'

export async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

export function parseXlsxSheetToAOA(
  buf: ArrayBuffer,
  opts?: {
    preferredSheetName?: string
  }
): unknown[][] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName =
    (opts?.preferredSheetName && wb.SheetNames.includes(opts.preferredSheetName) ? opts.preferredSheetName : null) ??
    wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  // header:1 => 첫 행을 헤더로 쓰지 않고 AOA(행 배열)로 반환
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][]
}

export function parseXlsxSheetToJsonRows(
  buf: ArrayBuffer,
  opts?: {
    preferredSheetName?: string
  }
): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName =
    (opts?.preferredSheetName && wb.SheetNames.includes(opts.preferredSheetName) ? opts.preferredSheetName : null) ??
    wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, {
    defval: '',
    raw: true,
  }) as Record<string, unknown>[]
}

export async function parseXlsxFileToJsonRows(
  file: File,
  opts?: {
    preferredSheetName?: string
  }
): Promise<Record<string, unknown>[]> {
  const buf = await readFileArrayBuffer(file)
  return parseXlsxSheetToJsonRows(buf, opts)
}

export async function parseXlsxFileToAOA(
  file: File,
  opts?: {
    preferredSheetName?: string
  }
): Promise<unknown[][]> {
  const buf = await readFileArrayBuffer(file)
  return parseXlsxSheetToAOA(buf, opts)
}





