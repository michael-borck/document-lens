interface ContextSegment {
  label: string
  onClick?: () => void
}

interface ProjectContextStripProps {
  segments: ContextSegment[]
}

export function ProjectContextStrip({ segments }: ProjectContextStripProps) {
  return (
    <div className="px-4 py-1.5 border-b border-border bg-muted/30 text-xs text-muted-foreground">
      {segments.length === 0 ? (
        <span className="italic">Project not configured yet — head to Setup to add documents and pick a keyword list.</span>
      ) : (
        segments.map((seg, i) => (
          <span key={i}>
            {i > 0 && <span className="px-2 text-border">·</span>}
            {seg.onClick ? (
              <button
                type="button"
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
                onClick={seg.onClick}
              >
                {seg.label}
              </button>
            ) : (
              <span>{seg.label}</span>
            )}
          </span>
        ))
      )}
    </div>
  )
}
