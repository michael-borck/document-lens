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

  it('a function missing one required pillar does not satisfy', () => {
    const cells = { B: { T: 5 } } // Teaching has Biosphere but not Society
    const out = weddingCakeFull(cells, [B, S], [T])
    expect(out.score).toBe(0)
    expect(out.trace[0].status).toBe('unmet')
    expect(out.trace[0].detail).toMatch(/Missing 1 of 2/)
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
