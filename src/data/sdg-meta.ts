/**
 * SDG metadata for the sustainability-defaults seed.
 *
 * SDG names: official UN SDG titles.
 *
 * Pillar mapping: Stockholm Resilience Centre Wedding Cake model
 * (https://www.stockholmresilience.org/research/research-news/2016-06-14-the-sdgs-wedding-cake.html).
 * Confirmed against the Wedding Cake EN PDF (2026-05-11).
 */

export interface SdgMeta {
  number: number
  name: string
  pillar: 'biosphere' | 'society' | 'economy' | 'partnership'
}

export const SDGS: SdgMeta[] = [
  { number: 1,  name: 'No Poverty',                              pillar: 'society' },
  { number: 2,  name: 'Zero Hunger',                             pillar: 'society' },
  { number: 3,  name: 'Good Health and Well-being',              pillar: 'society' },
  { number: 4,  name: 'Quality Education',                       pillar: 'society' },
  { number: 5,  name: 'Gender Equality',                         pillar: 'society' },
  { number: 6,  name: 'Clean Water and Sanitation',              pillar: 'biosphere' },
  { number: 7,  name: 'Affordable and Clean Energy',             pillar: 'society' },
  { number: 8,  name: 'Decent Work and Economic Growth',         pillar: 'economy' },
  { number: 9,  name: 'Industry, Innovation and Infrastructure', pillar: 'economy' },
  { number: 10, name: 'Reduced Inequalities',                    pillar: 'economy' },
  { number: 11, name: 'Sustainable Cities and Communities',      pillar: 'society' },
  { number: 12, name: 'Responsible Consumption and Production',  pillar: 'economy' },
  { number: 13, name: 'Climate Action',                          pillar: 'biosphere' },
  { number: 14, name: 'Life Below Water',                        pillar: 'biosphere' },
  { number: 15, name: 'Life on Land',                            pillar: 'biosphere' },
  { number: 16, name: 'Peace, Justice and Strong Institutions',  pillar: 'society' },
  { number: 17, name: 'Partnerships for the Goals',              pillar: 'partnership' },
]

export const PILLARS: Array<{
  value: string
  displayName: string
  description: string
  sortOrder: number
}> = [
  {
    value: 'biosphere',
    displayName: 'Biosphere',
    description: 'Foundation: planetary systems that all economies and societies depend on. SDGs 6, 13, 14, 15.',
    sortOrder: 1,
  },
  {
    value: 'society',
    displayName: 'Society',
    description: 'Social systems supported by the biosphere. SDGs 1, 2, 3, 4, 5, 7, 11, 16.',
    sortOrder: 2,
  },
  {
    value: 'economy',
    displayName: 'Economy',
    description: 'Economic activity, supported by and shaped by society. SDGs 8, 9, 10, 12.',
    sortOrder: 3,
  },
  {
    value: 'partnership',
    displayName: 'Partnership',
    description: 'Connector across all levels — partnerships for delivery. SDG 17.',
    sortOrder: 4,
  },
]

export const FUNCTIONS: Array<{
  value: string
  displayName: string
  description: string
  sortOrder: number
}> = [
  {
    value: 'teaching',
    displayName: 'Teaching',
    description: 'Curriculum, pedagogy, student learning, course design.',
    sortOrder: 1,
  },
  {
    value: 'research',
    displayName: 'Research',
    description: 'Inquiry, innovation, knowledge production, academic outputs.',
    sortOrder: 2,
  },
  {
    value: 'engagement',
    displayName: 'Engagement',
    description: 'Community partnerships, outreach, reconciliation, public-facing work.',
    sortOrder: 3,
  },
  {
    value: 'operations',
    displayName: 'Operations',
    description: 'Infrastructure, administration, sustainability practices, internal systems.',
    sortOrder: 4,
  },
]
