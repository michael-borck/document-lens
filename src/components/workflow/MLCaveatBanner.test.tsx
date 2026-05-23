import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MLCaveatBanner, __resetCaveatDismissals } from './MLCaveatBanner'

beforeEach(() => __resetCaveatDismissals())
afterEach(cleanup)

describe('MLCaveatBanner', () => {
  it('renders its caveat copy and can be dismissed', () => {
    render(<MLCaveatBanner id="map">semantic similarity caveat</MLCaveatBanner>)
    expect(screen.getByText('semantic similarity caveat')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('semantic similarity caveat')).toBeNull()
  })

  it('stays dismissed for the same id within the session', () => {
    const { unmount } = render(<MLCaveatBanner id="map">first mount</MLCaveatBanner>)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    unmount()
    render(<MLCaveatBanner id="map">second mount</MLCaveatBanner>)
    expect(screen.queryByText('second mount')).toBeNull()
  })

  it('dismissing one id leaves another visible', () => {
    render(<MLCaveatBanner id="a">caveat A</MLCaveatBanner>)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    render(<MLCaveatBanner id="b">caveat B</MLCaveatBanner>)
    expect(screen.getByText('caveat B')).toBeTruthy()
  })
})
