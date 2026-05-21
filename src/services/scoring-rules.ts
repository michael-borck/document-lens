import { selectAllKeyed, selectOneKeyed, runStatementKeyed, dbBool, toDbBool, newId, now, parseJson, stringifyJson } from './db'
import type { ScoringRule, ScoringRuleDefinition, ScoringRuleLevel } from '@/types/data'

interface ScoringRuleRow {
  id: string
  name: string
  description: string | null
  is_builtin: number
  definition: string
  output_levels: string
  created_at: string
  updated_at: string
}

function rowToRule(row: ScoringRuleRow): ScoringRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isBuiltin: dbBool(row.is_builtin),
    definition: parseJson<ScoringRuleDefinition>(row.definition, {}),
    outputLevels: parseJson<ScoringRuleLevel[]>(row.output_levels, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listScoringRules(): Promise<ScoringRule[]> {
  const rows = await selectAllKeyed<ScoringRuleRow>('scoringRules.list')
  return rows.map(rowToRule)
}

export async function getScoringRule(id: string): Promise<ScoringRule | null> {
  const row = await selectOneKeyed<ScoringRuleRow>('scoringRules.getById', [id])
  return row ? rowToRule(row) : null
}

export interface CreateScoringRuleInput {
  name: string
  description?: string
  isBuiltin?: boolean
  definition: ScoringRuleDefinition
  outputLevels: ScoringRuleLevel[]
}

export async function createScoringRule(input: CreateScoringRuleInput): Promise<ScoringRule> {
  const id = newId()
  const timestamp = now()
  await runStatementKeyed('scoringRules.create', [
    id,
    input.name,
    input.description ?? null,
    toDbBool(input.isBuiltin ?? false),
    stringifyJson(input.definition),
    stringifyJson(input.outputLevels),
    timestamp,
    timestamp,
  ])
  const created = await getScoringRule(id)
  if (!created) throw new Error(`Failed to create scoring rule ${input.name}`)
  return created
}

export async function deleteScoringRule(id: string): Promise<void> {
  await runStatementKeyed('scoringRules.deleteById', [id])
}

/**
 * Count how many projects reference this scoring rule. Used by the
 * Settings rule editor to warn before destructive action.
 */
export async function countProjectsUsingScoringRule(ruleId: string): Promise<number> {
  const row = await selectOneKeyed<{ n: number }>('scoringRules.countProjectsUsing', [ruleId])
  return row?.n ?? 0
}
