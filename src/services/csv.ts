/**
 * Tiny CSV parser. Handles quoted fields (including escaped quotes and
 * embedded commas) and \r\n / \n line endings.
 *
 * Returns an array of rows, where each row is an array of strings. The
 * caller is responsible for header handling.
 *
 * Limitations:
 *   - Doesn't support multi-line fields (newline inside a quoted value)
 *     — uncommon in our document-attribute use case and complicates the
 *     parser significantly.
 *   - Doesn't trim whitespace; caller decides.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // escaped double-quote inside a quoted field
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        current.push(field)
        field = ''
      } else if (c === '\n') {
        current.push(field)
        rows.push(current)
        current = []
        field = ''
      } else if (c === '\r') {
        // skip; \n right after will close the row
      } else {
        field += c
      }
    }
  }
  // Flush the last field / row if the file didn't end with a newline.
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  return rows
}

/**
 * Neutralise spreadsheet formula / DDE injection. A text cell whose first
 * character is one of = + - @ (or a leading tab/CR) is interpreted as a
 * formula by Excel / Google Sheets / LibreOffice — so a document titled
 * `=HYPERLINK(...)` or `=cmd|'/c calc'!A1` in an exported CSV would execute
 * on open. Prefixing with a single quote forces the cell to be treated as
 * literal text. Only applied to string cells so numeric columns are
 * unaffected.
 */
function neutralizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/**
 * Serialise rows to CSV. Neutralises formula-injection in text cells, then
 * quotes fields containing commas, quotes, or newlines; escapes embedded
 * quotes by doubling them.
 */
export function stringifyCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const raw = cell === null || cell === undefined ? '' : String(cell)
          const s = typeof cell === 'string' ? neutralizeFormula(raw) : raw
          if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(',')
    )
    .join('\n')
}
