import { Outlet, useParams } from 'react-router-dom'
import { ProjectBar } from '@/components/project/ProjectBar'
import { ProjectContextStrip } from '@/components/project/ProjectContextStrip'
import { WorkflowTabs } from '@/components/project/WorkflowTabs'

/**
 * Project workspace shell. Routes /projects/:projectId/* render their
 * workflow page inside the Outlet below the tabs.
 *
 * Setup-completion state is hard-coded to false until the data layer
 * lands in a later commit. When false, all workflow tabs are disabled.
 */
export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null

  // TODO(phase-1-data): replace with a real project-store query that
  // returns name + setup status. For now, the workspace renders with
  // placeholder context.
  const projectName = `Project ${projectId}`
  const setupComplete = false

  return (
    <div className="flex flex-col h-full">
      <ProjectBar projectName={projectName} />
      <ProjectContextStrip segments={[]} />
      <WorkflowTabs setupComplete={setupComplete} />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
