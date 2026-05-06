import { useState, useEffect } from 'react'
import { Download, RefreshCw, X, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { UpdateInfo, UpdateProgress } from '@/types/electron'

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electron) return

    const unsubAvailable = window.electron.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setState('available')
      setDismissed(false)
    })

    const unsubNotAvailable = window.electron.onUpdateNotAvailable(() => {
      // Stay idle, no notification needed
    })

    const unsubProgress = window.electron.onUpdateDownloadProgress((prog) => {
      setProgress(prog)
      setState('downloading')
    })

    const unsubDownloaded = window.electron.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setState('downloaded')
    })

    const unsubError = window.electron.onUpdateError((err) => {
      setError(err)
      setState('error')
    })

    return () => {
      unsubAvailable()
      unsubNotAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [])

  const handleDownload = async () => {
    setState('downloading')
    setProgress({ percent: 0, bytesPerSecond: 0, total: 0, transferred: 0 })
    const result = await window.electron.downloadUpdate()
    if (!result.success && result.error) {
      setError(result.error)
      setState('error')
    }
  }

  const handleInstall = () => {
    window.electron.installUpdate()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Don't show anything if idle or dismissed
  if (state === 'idle' || dismissed) {
    return null
  }

  return (
    <div
      className={cn(
        'mx-2 mb-2 rounded-lg border p-3 text-sm',
        state === 'error'
          ? 'border-destructive/50 bg-destructive/10'
          : 'border-primary/50 bg-primary/10'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-0.5">
          {state === 'downloaded' ? (
            <CheckCircle className="h-4 w-4 text-brass" />
          ) : state === 'downloading' ? (
            <Download className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <RefreshCw className="h-4 w-4 text-primary" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {state === 'available' && (
            <>
              <p className="font-medium">Update available</p>
              <p className="text-muted-foreground">
                Version {updateInfo?.version} is ready to download
              </p>
            </>
          )}

          {state === 'downloading' && (
            <>
              <p className="font-medium">Downloading update...</p>
              <div className="mt-2">
                <Progress value={progress?.percent ?? 0} className="h-2" />
              </div>
              <p className="text-muted-foreground mt-1">
                {progress?.percent.toFixed(0)}% complete
              </p>
            </>
          )}

          {state === 'downloaded' && (
            <>
              <p className="font-medium">Update ready to install</p>
              <p className="text-muted-foreground">
                Version {updateInfo?.version} has been downloaded
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <p className="font-medium text-destructive">Update failed</p>
              <p className="text-muted-foreground">{error}</p>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-2">
            {state === 'available' && (
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            )}

            {state === 'downloaded' && (
              <Button size="sm" onClick={handleInstall}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Restart & Install
              </Button>
            )}

            {state === 'error' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setState('idle')
                  setError(null)
                }}
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>

        {/* Dismiss button (only for available/downloaded states) */}
        {(state === 'available' || state === 'downloaded') && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss update notification"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
