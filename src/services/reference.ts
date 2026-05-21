/**
 * Reference data for document-attribute autocomplete.
 *
 * Industries and countries are seeded into the database at first launch
 * (electron/database.ts seedReferenceData). Pulled here so the Library
 * page can offer them as autocomplete suggestions when the user fills
 * in a document's sector or country.
 *
 * The values are NOT a closed set — users can type anything they want
 * in the inline editor. The list is just to bias toward consistency
 * (so "Banking" and "banking" don't both end up as separate sector
 * groupings later).
 */

import { selectAll } from './db'

interface ReferenceRow {
  code: string
  name: string
}

export interface ReferenceItem {
  code: string
  name: string
}

export async function listIndustries(): Promise<ReferenceItem[]> {
  const rows = await selectAll<ReferenceRow>('reference.listIndustries')
  return rows
}

