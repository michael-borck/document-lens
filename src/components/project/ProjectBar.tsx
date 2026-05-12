import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MoreVertical, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectBarProps {
  projectName: string
  /** Called when the user commits a renamed value. */
  onRename?: (next: string) => Promise<void> | void
}

/**
 * Project bar — back arrow, project name (click to rename), and a
 * trailing actions button.
 *
 * Rename UX: click the name to switch to an input, Enter or blur to
 * commit, Escape to cancel. Whitespace-only / empty commits are
 * rejected (revert to the original name). The save is async; while
 * it's in flight the input is disabled to prevent double-submit.
 */
export function ProjectBar({ projectName, onRename }: ProjectBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(projectName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(projectName)
  }, [projectName, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = () => {
    if (!onRename) return
    setDraft(projectName)
    setEditing(true)
  }

  const commit = async () => {
    if (saving) return
    const next = draft.trim()
    if (!next || next === projectName) {
      setEditing(false)
      setDraft(projectName)
      return
    }
    setSaving(true)
    try {
      await onRename?.(next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    setDraft(projectName)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Back to projects"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      {editing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') cancel()
            }}
            disabled={saving}
            className="font-display text-base font-medium flex-1 px-2 py-0.5 border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
          />
          <button
            type="button"
            onClick={commit}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground p-1 rounded disabled:opacity-50"
            title="Save (Enter)"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground p-1 rounded disabled:opacity-50"
            title="Cancel (Escape)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!onRename}
          className={cn(
            'group flex items-center gap-2 flex-1 min-w-0 text-left rounded px-2 py-0.5 -mx-2',
            onRename && 'hover:bg-muted/40 transition-colors cursor-text'
          )}
          title={onRename ? 'Click to rename' : undefined}
        >
          <h1 className="font-display text-base font-medium truncate">
            {projectName}
          </h1>
          {onRename && (
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </button>
      )}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0"
        title="Project actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </div>
  )
}
