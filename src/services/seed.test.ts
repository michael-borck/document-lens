import { describe, it, expect } from 'vitest'
import { SUSTAINABILITY_SUGGESTION_CAPABILITY } from './seed'


describe('sustainability suggestion capability (ADR-0043)', () => {
  it('declares a domain, so the backend can check the models against it', () => {
    expect(SUSTAINABILITY_SUGGESTION_CAPABILITY.domain).toBe('climate-disclosure')
  })

  it('names one model per suggestion role', () => {
    const { models } = SUSTAINABILITY_SUGGESTION_CAPABILITY
    expect(Object.keys(models).sort()).toEqual(['commitment', 'detector', 'target'])
    for (const [role, id] of Object.entries(models)) {
      expect(id, `${role} must be a fully qualified model id`).toContain('/')
    }
  })

  it('does not pin revisions, so they resolve and are recorded per suggestion', () => {
    expect('revisions' in SUSTAINABILITY_SUGGESTION_CAPABILITY).toBe(false)
  })

  it('is data in this file rather than a name the backend owns', () => {
    // The whole point: the models are declared by the lens, so a second lens can
    // declare different ones without a change to the analysis service.
    const declared = SUSTAINABILITY_SUGGESTION_CAPABILITY.models
    expect(declared.detector).not.toBe('')
  })
})
