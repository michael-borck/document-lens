/**
 * The workflow catalogue — single source of truth for the tab strip and the
 * Overview page, so labels, questions, and phase grouping never drift.
 *
 * Phases teach the research journey: explore what the corpus contains →
 * measure it → verify the evidence holds up. Tab order follows phase order.
 */

export interface WorkflowDef {
  to: string
  label: string
  /** The research question this workflow answers (shown on its page header and Overview card). */
  question: string
  /** When true, unavailable until project setup is complete. */
  requiresSetup?: boolean
}

export interface WorkflowGroup {
  /** Phase label rendered in the tab strip and as an Overview section. null = ungrouped (Overview, Setup). */
  label: string | null
  /** One-line phase description for the Overview section heading. */
  description?: string
  workflows: WorkflowDef[]
}

export const WORKFLOW_GROUPS: WorkflowGroup[] = [
  {
    label: null,
    workflows: [
      { to: 'overview', label: 'Overview', question: 'Where is this project up to?' },
      {
        to: 'setup',
        label: 'Setup',
        question: 'Assemble this project: documents, keywords, axes, scoring rule.',
      },
    ],
  },
  {
    label: 'Explore',
    description: 'See what the corpus contains.',
    workflows: [
      {
        to: 'coverage',
        label: 'Coverage',
        question: 'Which of your documents discuss this framework?',
        requiresSetup: true,
      },
      {
        to: 'map',
        label: 'Map',
        question: 'Where in this document does each topic appear, and how do topics overlap?',
        requiresSetup: true,
      },
      {
        to: 'read',
        label: 'Read',
        question: 'What does each document actually say about a topic?',
        requiresSetup: true,
      },
      {
        to: 'discover',
        label: 'Discover',
        question: 'What words is your corpus using that you should know about?',
        requiresSetup: true,
      },
    ],
  },
  {
    label: 'Measure',
    description: 'Put numbers on it.',
    workflows: [
      {
        to: 'score',
        label: 'Score',
        question: 'How does this document rate on your chosen rubric?',
        requiresSetup: true,
      },
      {
        to: 'track',
        label: 'Track',
        question: 'How has this topic changed over the years?',
        requiresSetup: true,
      },
      {
        to: 'compare',
        label: 'Compare',
        question: 'Which document does best on this framework?',
        requiresSetup: true,
      },
    ],
  },
  {
    label: 'Verify',
    description: 'Check the evidence holds up.',
    workflows: [
      {
        to: 'audit',
        label: 'Audit',
        question: 'Is each keyword being used in the right context?',
        requiresSetup: true,
      },
      {
        to: 'gap',
        label: 'Gap',
        question: 'Where does the tone run ahead of the substance?',
        requiresSetup: true,
      },
      {
        to: 'focus',
        label: 'Focus',
        question: 'Which documents should you look at first?',
        requiresSetup: true,
      },
    ],
  },
]

export const WORKFLOW_IDS: string[] = WORKFLOW_GROUPS.flatMap((g) => g.workflows.map((w) => w.to))

/** localStorage key for the last workflow visited in a project. */
export function lastWorkflowKey(projectId: string): string {
  return `document-lens:last-workflow:${projectId}`
}

/** The workflow a project should open on: last visited, falling back to Overview. */
export function landingWorkflow(projectId: string): string {
  try {
    const stored = window.localStorage.getItem(lastWorkflowKey(projectId))
    if (stored && WORKFLOW_IDS.includes(stored)) return stored
  } catch {
    // localStorage unavailable (tests, locked-down env) — fall through
  }
  return 'overview'
}

export function rememberWorkflow(projectId: string, workflow: string): void {
  if (!WORKFLOW_IDS.includes(workflow)) return
  try {
    window.localStorage.setItem(lastWorkflowKey(projectId), workflow)
  } catch {
    // best-effort only
  }
}
