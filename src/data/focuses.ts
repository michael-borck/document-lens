// Research focuses - each focus bundles related keyword frameworks
// for specific research domains

export interface Focus {
  id: string
  name: string
  description: string
  icon: string // Lucide icon name
  color: string // Tailwind color class
}

export const FOCUSES: Focus[] = [
  {
    id: 'sustainability',
    name: 'Sustainability',
    description: 'ESG reporting, climate disclosures, and sustainable development frameworks (TCFD, GRI, SDGs, SASB)',
    icon: 'Leaf',
    color: 'text-green-600'
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    description: 'Security frameworks, compliance standards, and threat analysis (NIST CSF, ISO 27001, CIS Controls)',
    icon: 'Shield',
    color: 'text-blue-600'
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Financial analysis, regulatory compliance, and risk management (SEC, GAAP, Basel III)',
    icon: 'TrendingUp',
    color: 'text-amber-600'
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Clinical research, regulatory submissions, and healthcare compliance (FDA, HIPAA, Clinical Trials)',
    icon: 'Heart',
    color: 'text-red-600'
  },
  {
    id: 'legal',
    name: 'Legal',
    description: 'Contract analysis, regulatory language, and compliance review',
    icon: 'Scale',
    color: 'text-purple-600'
  },
  {
    id: 'academic',
    name: 'Academic Research',
    description: 'Research methodology, literature review, and scholarly analysis',
    icon: 'GraduationCap',
    color: 'text-indigo-600'
  },
  {
    id: 'project-management',
    name: 'Project Management',
    description: 'Agile, PMBOK, and project documentation analysis',
    icon: 'ClipboardList',
    color: 'text-orange-600'
  },
  {
    id: 'general',
    name: 'General',
    description: 'No pre-loaded frameworks - start with custom keywords only',
    icon: 'FileText',
    color: 'text-gray-600'
  }
]

export const DEFAULT_FOCUS = 'sustainability'

export function getFocus(id: string): Focus | undefined {
  return FOCUSES.find(f => f.id === id)
}

export function getFocusFrameworks(focusId: string): string[] {
  // Map focus IDs to their framework IDs
  // Each focus includes specific frameworks plus a general domain keyword list
  const focusFrameworks: Record<string, string[]> = {
    'sustainability': ['sustainability-general', 'tcfd', 'gri', 'sdgs', 'sasb', 'sdgs-wedding-cake', 'sdgs-wedding-cake-counter'],
    'cybersecurity': ['cybersecurity-general', 'nist-csf', 'iso-27001', 'cis-controls', 'mitre-attack'],
    'finance': ['finance-general', 'financial-ratios', 'sec-regulations', 'basel-iii', 'risk-metrics'],
    'healthcare': ['healthcare-general', 'clinical-trials', 'fda-regulations', 'hipaa', 'medical-terminology'],
    'legal': ['legal-general', 'contract-terms', 'regulatory-language', 'legal-clauses', 'compliance-keywords'],
    'academic': ['academic-general', 'research-methods', 'statistical-terms', 'literature-review', 'citation-analysis'],
    'project-management': ['project-management-general', 'agile-scrum', 'pmbok', 'risk-management-pm', 'resource-planning'],
    'general': []
  }
  return focusFrameworks[focusId] || []
}
