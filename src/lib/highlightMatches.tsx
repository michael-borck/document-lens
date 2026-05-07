import type { ReactNode } from 'react'

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

/**
 * Safely highlight occurrences of `query` inside `text`. Returns React nodes
 * (no HTML parsing, no XSS surface) suitable for direct rendering inside JSX.
 *
 * Why a helper: replacing innerHTML with a regex-built string lets attacker-
 * controlled text (e.g. extracted from a PDF) inject markup. Splitting and
 * wrapping in JSX <mark> avoids that entirely.
 */
export function highlightMatches(
  text: string,
  query: string,
  className = 'bg-brass/25 text-foreground px-0.5',
): ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(ESCAPE_RE, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  // Split with a single capturing group puts matches at odd indices.
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className={className}>{part}</mark>
      : part,
  )
}
