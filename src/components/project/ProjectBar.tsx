import { Link } from 'react-router-dom'
import { ArrowLeft, MoreVertical } from 'lucide-react'

interface ProjectBarProps {
  projectName: string
}

export function ProjectBar({ projectName }: ProjectBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Back to projects"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <h1 className="font-display text-base font-medium flex-1 truncate">
        {projectName}
      </h1>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground p-1 rounded"
        title="Project actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </div>
  )
}
