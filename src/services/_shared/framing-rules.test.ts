import { describe, it, expect } from 'vitest'
import { detectFraming } from './framing-rules'

describe('detectFraming (rung 0 — ADR-0039)', () => {
  it('detects the legend\u2019s Quantified example: direction + number + date', () => {
    const hit = detectFraming('We are committed to net zero by 2035.')
    expect(hit).not.toBeNull()
    expect(hit!.value).toBe('2')
    expect(hit!.rule).toBe('quantified-number-date')
  })

  it('detects Quantified with number + unit before the date anchor', () => {
    const hit = detectFraming('We will reduce emissions 35 per cent by 2030 across the group.')
    expect(hit!.value).toBe('2')
  })

  it('detects the legend\u2019s Limit phrases and beats Quantified when both fire', () => {
    expect(detectFraming('We will operate within planetary boundaries.')!.value).toBe('3')
    expect(detectFraming('Emissions must not exceed the carbon budget of 2 tonnes by 2030.')!.value).toBe('3')
    expect(detectFraming('Our target is to reduce energy use; the estate will stay within its water allocation.')!.value).toBe('3')
  })

  it('stays silent where a rule would be noise', () => {
    // Aspirational — semantic, the ML run's job, never a regex call.
    expect(detectFraming('We aspire to reduce our footprint.')).toBeNull()
    // Silent — a named subject with no arrow.
    expect(detectFraming('Our climate strategy sets out our approach.')).toBeNull()
    // A date with no direction, a number with no direction.
    expect(detectFraming('The report was published by 2030 standards bodies.')).toBeNull()
    expect(detectFraming('Revenue grew 12 per cent.')).toBeNull()
  })

  it('does not misfire on mid-word accidents', () => {
    expect(detectFraming('The cataloguer documented seals by 2018 dating methods.')).toBeNull()
  })
})
