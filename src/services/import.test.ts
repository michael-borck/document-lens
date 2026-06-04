import { describe, it, expect } from 'vitest'
import { detectYearFromFilename } from './import'

describe('detectYearFromFilename', () => {
  it('takes the end year of a full financial-year range (AU FY convention)', () => {
    // FY2021-22 covers Jul 2021 – Jun 2022 and is cited as "FY2022".
    expect(detectYearFromFilename('acme-annual-report-2021-2022.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-2021-2022-sustainability.pdf')).toBe(2022)
  })

  it('handles the short range form (2021-22) and slash/underscore separators', () => {
    expect(detectYearFromFilename('acme-2021-22.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-FY2021-22.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-2021_2022.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-2021/2022.pdf')).toBe(2022)
  })

  it('uses a single year as-is', () => {
    expect(detectYearFromFilename('acme-FY2022.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-2022-annual-report.pdf')).toBe(2022)
    expect(detectYearFromFilename('acme-annual-report-2024.pdf')).toBe(2024)
  })

  it('does NOT treat non-consecutive year pairs as a financial-year range', () => {
    // 2021-2025 is a 4-year span, not an FY range → first standalone year.
    expect(detectYearFromFilename('coverage-2021-2025.pdf')).toBe(2021)
    // years separated by other tokens are not a range
    expect(detectYearFromFilename('acme-2023-q3-fy2024.pdf')).toBe(2023)
  })

  it('does not misread a full date as a range', () => {
    expect(detectYearFromFilename('report-31-12-2022.pdf')).toBe(2022)
  })

  it('returns null when there is no year', () => {
    expect(detectYearFromFilename('annual-report-final.pdf')).toBeNull()
  })
})
