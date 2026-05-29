import { describe, it, expect } from 'vitest'
import { parseCsv, stringifyCsv } from './csv'

describe('stringifyCsv formula-injection guard', () => {
  it('prefixes cells beginning with formula triggers', () => {
    const out = stringifyCsv([
      ['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)'],
    ])
    const fields = out.split(',')
    // First cell has embedded quotes → guarded then wrapped, quotes doubled.
    expect(fields[0]).toBe(`"'=HYPERLINK(""http://evil"")"`)
    expect(fields[1]).toBe("'+1+1")
    expect(fields[2]).toBe("'-2+3")
    expect(fields[3]).toBe("'@SUM(A1)")
  })

  it('wraps and neutralises a formula cell that also contains a comma', () => {
    const out = stringifyCsv([['=cmd|\'/c calc\'!A1, more']])
    // Leading quote added, then the whole field wrapped because of the comma.
    expect(out).toBe(`"'=cmd|'/c calc'!A1, more"`)
  })

  it('does not touch ordinary text or numeric cells', () => {
    expect(stringifyCsv([['Acme Corp', 2024, -5]])).toBe('Acme Corp,2024,-5')
  })

  it('leaves negative-number cells passed as numbers unguarded', () => {
    // number type → no formula guard, so charts/counts are unaffected
    expect(stringifyCsv([[-5, 0, 3.14]])).toBe('-5,0,3.14')
  })
})

describe('parseCsv', () => {
  it('round-trips ordinary rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with embedded commas and quotes', () => {
    expect(parseCsv('"a,b","c""d"')).toEqual([['a,b', 'c"d']])
  })
})
