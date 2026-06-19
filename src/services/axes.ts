import { selectAll, selectOne, runStatement, dbBool, toDbBool, newId, now } from './db'
import type { Axis, AxisType, AxisValue } from '@/types/data'

// DB tables: lenses, lens_values. "Axis" is the TypeScript concept; the DB schema uses "lens" historically.

interface AxisRow {
  id: string
  name: string
  description: string | null
  type: AxisType
  is_hierarchical: number
  is_builtin: number
  created_at: string
}

interface AxisValueRow {
  id: string
  lens_id: string
  value: string
  display_name: string | null
  description: string | null
  parent_value_id: string | null
  sort_order: number
}

function rowToAxis(row: AxisRow): Axis {
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

function rowToAxisValue(row: AxisValueRow): AxisValue {
  return {
    id: row.id,
    axisId: row.lens_id,
    value: row.value,
    displayName: row.display_name,
    description: row.description,
    parentValueId: row.parent_value_id,
    sortOrder: row.sort_order,
  }
}

export async function listAxes(): Promise<Axis[]> {
  const rows = await selectAll<AxisRow>('lenses.list')
  return rows.map(rowToAxis)
}

export async function getAxis(id: string): Promise<Axis | null> {
  const row = await selectOne<AxisRow>('lenses.getById', [id])
  return row ? rowToAxis(row) : null
}

export async function listAxisValues(axisId: string): Promise<AxisValue[]> {
  const rows = await selectAll<AxisValueRow>('lenses.listValues', [axisId])
  return rows.map(rowToAxisValue)
}

export interface CreateAxisInput {
  name: string
  description?: string
  type: AxisType
  isHierarchical?: boolean
  isBuiltin?: boolean
}

export async function createAxis(input: CreateAxisInput): Promise<Axis> {
  const id = newId()
  await runStatement('lenses.create', [
    id,
    input.name,
    input.description ?? null,
    input.type,
    toDbBool(input.isHierarchical ?? false),
    toDbBool(input.isBuiltin ?? false),
    now(),
  ])
  const created = await getAxis(id)
  if (!created) throw new Error(`Failed to create axis ${input.name}`)
  return created
}

export interface CreateAxisValueInput {
  axisId: string
  value: string
  displayName?: string
  description?: string
  parentValueId?: string
  sortOrder?: number
}

export async function createAxisValue(input: CreateAxisValueInput): Promise<AxisValue> {
  const id = newId()
  await runStatement('lenses.createValue', [
    id,
    input.axisId,
    input.value,
    input.displayName ?? null,
    input.description ?? null,
    input.parentValueId ?? null,
    input.sortOrder ?? 0,
  ])
  const row = await selectOne<AxisValueRow>('lenses.getValueById', [id])
  if (!row) throw new Error(`Failed to create axis value ${input.value}`)
  return rowToAxisValue(row)
}

export async function deleteAxis(id: string): Promise<void> {
  await runStatement('lenses.deleteById', [id])
}

export async function deleteAxisValue(id: string): Promise<void> {
  await runStatement('lenses.deleteValueById', [id])
}

/**
 * Count how many projects currently activate this axis. Used by the
 * Axes page to surface "you're about to delete an axis X projects
 * still use" before allowing destructive action.
 */
export async function countProjectsUsingAxis(axisId: string): Promise<number> {
  const row = await selectOne<{ n: number }>('lenses.countProjectsUsing', [axisId])
  return row?.n ?? 0
}
