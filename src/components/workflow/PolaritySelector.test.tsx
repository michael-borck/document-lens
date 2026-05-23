import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PolaritySelector } from './PolaritySelector'

afterEach(cleanup)

describe('PolaritySelector', () => {
  it('renders a control showing the selected polarity label', () => {
    render(<PolaritySelector value="both" onChange={vi.fn()} />)
    // Radix SelectTrigger exposes role="combobox"; the selected value renders inside it.
    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeTruthy()
    expect(trigger.textContent).toContain('Both')
  })

  it('reflects a non-default selected value', () => {
    render(<PolaritySelector value="counter" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox').textContent).toContain('Counter')
  })
})
