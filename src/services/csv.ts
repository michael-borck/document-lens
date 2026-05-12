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
 * Serialise rows to CSV. Quotes fields containing commas, quotes, or
 * newlines; escapes embedded quotes by doubling them.
 */
export function stringifyCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell)
          if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(',')
    )
    .join('\n')
}
