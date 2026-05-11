import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface InlineEditableCellProps {
  value: string | number | null
  /** Called when the user commits a change (blur or Enter). */
  onCommit: (next: string | null) => Promise<void> | void
  /** When true, the value is parsed as an integer. Empty string -> null. */
  numeric?: boolean
  placeholder?: string
  /** Width of the input in pixels. */
  width?: number
  className?: string
  /** Custom display formatter when not editing. */
  formatDisplay?: (value: string | number | null) => React.ReactNode
}

/**
 * Click-to-edit table cell. Click the displayed value to switch to an
 * input; Enter / blur commits, Escape cancels. For numeric mode, an
 * empty input commits as null (so the user can clear a wrong year).
 */
export function InlineEditableCell({
  value,
  onCommit,
  numeric = false,
  placeholder,
  width = 80,
  className,
  formatDisplay,
}: InlineEditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(value === null || value === undefined ? '' : String(value))
    setEditing(true)
  }

  const commit = async () => {
    if (saving) return
    setSaving(true)
    try {
      const trimmed = draft.trim()
      if (trimmed === '') {
        await onCommit(null)
      } else if (numeric) {
        const n = Number(trimmed)
        if (Number.isFinite(n)) {
          await onCommit(String(Math.trunc(n)))
        } else {
          // invalid input; revert
        }
      } else {
        await onCommit(trimmed)
      }
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    setDraft('')
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={numeric ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') cancel()
        }}
        placeholder={placeholder}
        disabled={saving}
        style={{ width }}
        className="text-sm tabular-nums px-1 py-0.5 border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
      />
    )
  }

  const display = formatDisplay
    ? formatDisplay(value)
    : value === null || value === undefined || value === ''
      ? <span className="italic text-muted-foreground/70">—</span>
      : value

  return (
    <button
      type="button"
      onClick={startEdit}
      className={cn(
        'text-left hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors min-w-[2rem]',
        className
      )}
      title="Click to edit"
    >
      {display}
    </button>
  )
}
