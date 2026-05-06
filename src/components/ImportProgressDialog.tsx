import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { FileText, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import type { ImportProgress, ImportResult } from '@/services/documents'

interface ImportProgressDialogProps {
  open: boolean
  progress: ImportProgress | null
  results: ImportResult[]
  onClose?: () => void
}

export function ImportProgressDialog({ open, progress, results, onClose }: ImportProgressDialogProps) {
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0

  const isFailed = progress?.status === 'failed'
  const isTerminal = progress?.status === 'completed' || isFailed

  const title = isFailed
    ? 'Import Failed'
    : progress?.status === 'completed'
      ? 'Import Complete'
      : 'Importing Documents'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isTerminal) onClose?.()
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => { if (!isTerminal) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!isTerminal) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isTerminal && progress && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{progress.currentFile}</p>
                  <p className="text-xs text-muted-foreground">
                    Processing file {progress.current} of {progress.total}
                  </p>
                </div>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </>
          )}

          {isFailed && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Import was interrupted</p>
                {progress?.error && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">{progress.error}</p>
                )}
              </div>
            </div>
          )}

          {isTerminal && (
            <div className="space-y-3">
              {successCount > 0 && (
                <div className="flex items-center gap-2 text-brass">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">{successCount} file(s) imported successfully</span>
                </div>
              )}

              {failCount > 0 && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">{failCount} file(s) failed</span>
                </div>
              )}

              {results.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-2 text-sm border-b last:border-b-0"
                    >
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-brass shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{result.filename}</span>
                      {result.error && (
                        <span className="text-xs text-destructive truncate max-w-[150px]">
                          {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {onClose && (
                <Button onClick={onClose} className="w-full mt-4">
                  Close
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
