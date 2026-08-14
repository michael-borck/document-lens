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

/**
 * Five delivery Functions (ADR-0033). Values, display names, and
 * descriptions follow the domain researchers' "Coding legend" v9
 * verbatim in substance — the descriptions drive the embedding
 * classification, so their wording is the researchers', not ours.
 *
 * Their sixth domain value, Cross-cutting (a whole-of-institution claim
 * naming no single function), is deliberately NOT listed: assigning it
 * is a human judgement the classifier must never make.
 */
export const FUNCTIONS: Array<{
  value: string
  displayName: string
  description: string
  sortOrder: number
}> = [
  {
    value: 'research',
    displayName: 'Research',
    description:
      'The generation of new knowledge: research projects, grants, fellowships and contracts to do research; institutes and centres; research staff and expertise; HDR supervision and research training; outputs such as publications, creative works, datasets and findings; novel methods, processes, patents and frameworks; research into teaching itself (SoTL). Is new knowledge being generated?',
    sortOrder: 1,
  },
  {
    value: 'teaching',
    displayName: 'Teaching/curriculum',
    description:
      'Facilitating learning: degrees, units, courses, executive education, MOOCs and micro-credentials; enrolments, scholarships and funded places to study; curriculum and assessment; student learning, support, retention and completion; research built into a course. Is the passage about students learning or a programme of study?',
    sortOrder: 2,
  },
  {
    value: 'engagement',
    displayName: 'Engagement',
    description:
      'Mobilising knowledge, and relationships with outside parties: reviewing, editorial and learned-society roles; expert advice, consultancy and policy influence; partnerships with industry, government, community and other universities; advisory boards, joint appointments, philanthropy; public communication, advocacy, media, events and submissions; global partnerships and alliances. Is knowledge being put to work, or a relationship described?',
    sortOrder: 3,
  },
  {
    value: 'operations',
    displayName: 'Campus operations',
    description:
      'How the university sustains and runs itself as a physical and financial entity: buildings and energy, operational emissions and net-zero-operations targets, water, waste, procurement and supply chain, transport and travel, the university\'s own investments and divestment. The university acting on itself, not on the world. Is the passage about the university running itself?',
    sortOrder: 4,
  },
  {
    value: 'governance',
    displayName: 'Governance',
    description:
      'How the university sets its direction and holds itself accountable: strategic plans, mission and values, owned commitments and targets; councils, boards, committees, executive roles and portfolios, responsibility and reporting lines; risk management, oversight, audit, compliance, disclosure and policy frameworks. The steering of the institution, not the activity being steered. Is the passage about who decides, who is accountable, or how the institution is steered and monitored?',
    sortOrder: 5,
  },
]
