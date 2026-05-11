import type { ReactNode } from 'react'

interface PlaceholderPageProps {
  title: string
  /** One-sentence question this page will answer. */
  subtitle?: string
  /** Optional body content (e.g. user-story IDs the placeholder represents). */
  children?: ReactNode
}

/**
 * Skeleton for pages that haven't been built yet. Renders the page's
 * intended title + question subtitle so the IA shape is visible while
 * implementation lands.
 */
export function PlaceholderPage({ title, subtitle, children }: PlaceholderPageProps) {
  return (
    <div className="px-8 py-10 max-w-4xl">
      <h1 className="font-display text-2xl font-medium tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-muted-foreground italic">{subtitle}</p>
      )}
      <div className="mt-8 border border-dashed border-border rounded-lg p-8 text-sm text-muted-foreground">
        <div className="font-mono text-xs uppercase tracking-wide mb-2">Not yet implemented</div>
        {children ?? <p>This page will be built in a later phase per docs/design/information-architecture.md.</p>}
      </div>
    </div>
  )
}
