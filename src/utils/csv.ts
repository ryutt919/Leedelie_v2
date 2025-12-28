import Papa from 'papaparse'

export type ParsedCsv = {
  rows: string[][]
}

export async function readFileText(file: File) {
  return await file.text()
}

export function parseCsv(text: string): ParsedCsv {
  const r = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  })

  const rows: string[][] = []
  for (const row of r.data ?? []) {
    if (!Array.isArray(row)) continue
    rows.push(row.map((x) => (x ?? '').toString().trim()))
  }
  return { rows }
}



