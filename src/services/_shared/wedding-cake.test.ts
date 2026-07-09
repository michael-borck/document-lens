import { describe, it, expect } from 'vitest'
import { weddingCakeFull, weddingCakeV1 } from './wedding-cake'
import type { AxisValue } from '@/types/data'

function lv(id: string, value: string): AxisValue {
  return { id, axisId: 'L', value, displayName: null, description: null, parentValueId: null, sortOrder: 0 }
}

const B = lv('B', 'Biosphere')
const S = lv('S', 'Society')
const T = lv('T', 'Teaching')
const R = lv('R', 'Research')

describe('weddingCakeFull (pure)', () => {
  it('counts functions delivering every required pillar', () => {
    // Teaching has both pillars; Research has neither.
    const cells = { B: { T: 2 }, S: { T: 1 } }
    const out = weddingCakeFull(cells, [B, S], [T, R])
    expect(out.score).toBe(1)
    expect(out.max).toBe(2)
    const teaching = out.trace.find((s) => s.label === 'Teaching')!
    expect(teaching.status).toBe('met')
    expect(teaching.count).toBe(3) // 2 + 1 across required pillars
    expect(out.trace.find((s) => s.label === 'Research')!.status).toBe('unmet')
  })

  it('a function missing one required pillar is partial, not satisfying', () => {
    const cells = { B: { T: 5 } } // Teaching has Biosphere but not Society
    const out = weddingCakeFull(cells, [B, S], [T])
    expect(out.score).toBe(0) // tier unchanged: no function delivers ALL pillars
    expect(out.trace[0].status).toBe('partial')
    expect(out.trace[0].pillarsHit).toBe(1)
    expect(out.trace[0].ratio).toBe(0.5)
    expect(out.trace[0].detail).toMatch(/1 of 2/)
    // X/12-style fine coverage: 1 pillar hit of (1 function × 2 pillars) = 1/2.
    expect(out.pillarsCovered).toBe(1)
    expect(out.pillarsPossible).toBe(2)
    expect(out.overallRatio).toBe(0.5)
  })

  it('separates broad-but-shallow from empty (both score 0/4 on the tier)', () => {
    const fns = [T, R]
    const pillars = [B, S]
    // Broad-but-shallow: every function hits ONE pillar → 0/4 tier, but 2/4 fine.
    const shallow = weddingCakeFull({ B: { T: 1, R: 1 } }, pillars, fns)
    // Empty: nothing anywhere → 0/4 tier AND 0/4 fine.
    const empty = weddingCakeFull({}, pillars, fns)
    expect(shallow.score).toBe(0)
    expect(empty.score).toBe(0)
    expect(shallow.pillarsCovered).toBe(2) // T:1 + R:1
    expect(empty.pillarsCovered).toBe(0)
    expect(shallow.overallRatio).toBeGreaterThan(empty.overallRatio!)
  })

  it('all functions satisfy → full score', () => {
    const cells = { B: { T: 1, R: 1 }, S: { T: 1, R: 1 } }
    const out = weddingCakeFull(cells, [B, S], [T, R])
    expect(out.score).toBe(2)
    expect(out.max).toBe(2)
  })

  it('empty cells → zero', () => {
    expect(weddingCakeFull({}, [B, S], [T, R]).score).toBe(0)
  })
})

describe('weddingCakeV1 (pure)', () => {
  it('counts required pillars mentioned positively', () => {
    const out = weddingCakeV1({ B: 3, S: 0 }, [B, S, lv('E', 'Economy')])
    expect(out.score).toBe(1)
    expect(out.max).toBe(3)
    expect(out.trace[0]).toMatchObject({ label: 'Biosphere', status: 'met', count: 3 })
    expect(out.trace[1]).toMatchObject({ label: 'Society', status: 'unmet', count: 0 })
  })

  it('no required pillars → zero of zero', () => {
    const out = weddingCakeV1({ B: 9 }, [])
    expect(out).toMatchObject({ score: 0, max: 0, trace: [] })
  })
})
