import { selectAll, selectOne, runStatement, dbBool, toDbBool, newId, now } from './db'
import type { Lens, LensType, LensValue } from '@/types/data'

interface LensRow {
  id: string
  name: string
  description: string | null
  type: LensType
  is_hierarchical: number
  is_builtin: number
  created_at: string
}

interface LensValueRow {
  id: string
  lens_id: string
  value: string
  display_name: string | null
  description: string | null
  parent_value_id: string | null
  sort_order: number
}

function rowToLens(row: LensRow): Lens {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    isHierarchical: dbBool(row.is_hierarchical),
    isBuiltin: dbBool(row.is_builtin),
    createdAt: row.created_at,
  }
}

function rowToValue(row: LensValueRow): LensValue {
  return {
    id: row.id,
    lensId: row.lens_id,
    value: row.value,
    displayName: row.display_name,
    description: row.description,
    parentValueId: row.parent_value_id,
    sortOrder: row.sort_order,
  }
}

export async function listLenses(): Promise<Lens[]> {
  const rows = await selectAll<LensRow>('SELECT * FROM lenses ORDER BY is_builtin DESC, name')
  return rows.map(rowToLens)
}

export async function getLens(id: string): Promise<Lens | null> {
  const row = await selectOne<LensRow>('SELECT * FROM lenses WHERE id = ?', [id])
  return row ? rowToLens(row) : null
}

export async function listLensValues(lensId: string): Promise<LensValue[]> {
  const rows = await selectAll<LensValueRow>(
    'SELECT * FROM lens_values WHERE lens_id = ? ORDER BY sort_order, value',
    [lensId]
  )
  return rows.map(rowToValue)
}

export interface CreateLensInput {
  name: string
  description?: string
  type: LensType
  isHierarchical?: boolean
  isBuiltin?: boolean
}

export async function createLens(input: CreateLensInput): Promise<Lens> {
  const id = newId()
  await runStatement(
    `INSERT INTO lenses (id, name, description, type, is_hierarchical, is_builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? null,
      input.type,
      toDbBool(input.isHierarchical ?? false),
      toDbBool(input.isBuiltin ?? false),
      now(),
    ]
  )
  const created = await getLens(id)
  if (!created) throw new Error(`Failed to create lens ${input.name}`)
  return created
}

export interface CreateLensValueInput {
  lensId: string
  value: string
  displayName?: string
  description?: string
  parentValueId?: string
  sortOrder?: number
}

export async function createLensValue(input: CreateLensValueInput): Promise<LensValue> {
  const id = newId()
  await runStatement(
    `INSERT INTO lens_values
       (id, lens_id, value, display_name, description, parent_value_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.lensId,
      input.value,
      input.displayName ?? null,
      input.description ?? null,
      input.parentValueId ?? null,
      input.sortOrder ?? 0,
    ]
  )
  const row = await selectOne<LensValueRow>('SELECT * FROM lens_values WHERE id = ?', [id])
  if (!row) throw new Error(`Failed to create lens value ${input.value}`)
  return rowToValue(row)
}

export async function deleteLens(id: string): Promise<void> {
  await runStatement('DELETE FROM lenses WHERE id = ?', [id])
}
