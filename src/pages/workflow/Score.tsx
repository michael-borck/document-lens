import { PlaceholderPage } from '@/components/PlaceholderPage'

export function Score() {
  return (
    <PlaceholderPage
      title="Score"
      subtitle="How does this document rate on your chosen rubric?"
    >
      <p>Per-document level indicator with the underlying matrix that drove the score (auditability) and a "Why this score" panel. Project-aggregate mode shows score distribution. Default rule: 5-level Wedding Cake Score. US-H-01 through US-H-05.</p>
    </PlaceholderPage>
  )
}
