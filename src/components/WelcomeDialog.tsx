import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export function WelcomeDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    const showWelcome = localStorage.getItem('showWelcomeDialog')
    if (showWelcome !== 'false') {
      setOpen(true)
    }
  }, [])

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('showWelcomeDialog', 'false')
    }
    setOpen(false)
  }

  const handleStartTour = () => {
    handleClose()
    navigate('/')
  }

  const handleReadDocs = () => {
    handleClose()
    navigate('/help/user-guide')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="label-masthead">No. 001 · Preface</div>
          <DialogTitle className="text-3xl mt-2">
            Welcome to <span className="italic text-primary">Document Lens</span>
          </DialogTitle>
          <DialogDescription className="mt-2">
            A reading instrument for the systematic analysis of document collections.
          </DialogDescription>
        </DialogHeader>

        {/* Top rule */}
        <div className="border-t border-border -mx-1" />

        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-foreground/80">
            Document Lens helps researchers examine document corpora at scale —
            annual reports, policy papers, scholarly articles — through curated
            keyword frameworks, hierarchical taxonomies, and n-gram discovery.
          </p>

          <div>
            <div className="label-masthead mb-3">Getting Started</div>
            <ol className="space-y-2.5 text-sm">
              {[
                'Create a project and choose a research focus',
                'Import PDF documents into your library',
                'Select keywords from built-in frameworks or import your own',
                'Search, discover patterns, visualize, and export findings',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono tabular text-xs text-primary font-medium pt-0.5 w-4 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-foreground/80 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Button onClick={handleReadDocs} className="w-full" size="lg">
            <BookOpen className="h-4 w-4 mr-2" />
            Read the User Manual
          </Button>

          <Button onClick={handleStartTour} variant="outline" className="w-full">
            <Play className="h-3.5 w-3.5 mr-2" />
            Start Exploring
          </Button>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <label htmlFor="dontShowAgain" className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              id="dontShowAgain"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <span className="text-xs text-muted-foreground">Don't show this again</span>
          </label>
          <span className="label-masthead !text-[10px]">Re-enable in Settings</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
