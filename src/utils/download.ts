import { saveAs } from 'file-saver'

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  saveAs(blob, filename)
}



