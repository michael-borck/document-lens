import { Link } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HelpButtonProps {
  section?: string
  anchor?: string
  tooltip?: string
}

/**
 * Context-specific help button that links to relevant documentation
 *
 * Usage:
 * <HelpButton section="user-guide" tooltip="Learn about document library" />
 */
export function HelpButton({ section = 'user-guide', tooltip = 'View help' }: HelpButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to={`/help/${section}`}>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
