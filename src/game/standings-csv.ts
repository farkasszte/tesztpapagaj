/**
 * A játék végi ranglista letöltése.
 *
 * A tanár a színpad záróképernyőjéről viszi el az eredményt: egy CSV, amit az
 * Excel magyar beállításokkal is egyből oszlopokra bont (`;` az elválasztó, és
 * a fájl elején ott a BOM, hogy az ékezetek se vesszenek el).
 */

export type CsvRow = (string | number)[]

/** A cella: pontosvessző és idézőjel miatt idézőjelbe kerül, a belsőt duplázva. */
function cell(value: string | number): string {
  const text = String(value ?? '')
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Fejléc-sor a játék nevével, utána a táblázat. BOM-mal, CRLF-fel. */
export function buildCsv(title: string, header: CsvRow, rows: CsvRow[]): string {
  const lines = [[title], header, ...rows].map((row) => row.map(cell).join(';'))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** A letöltés: ideiglenes link, majd kattintás — a böngésző menti a fájlt. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // A böngésző a kattintás után elengedi a blobot; a visszavonás nem sürgős.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** A fájlnév: a játék neve, ékezetek nélkül és biztonságos karakterekkel. */
export function csvFilename(title: string, stamp = new Date()): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9-_ ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'jatek'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${base}-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.csv`
}
