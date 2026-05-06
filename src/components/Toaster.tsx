import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

const VARIANT_STYLES = {
  error: {
    border: 'border-primary/40',
    bg: 'bg-card',
    icon: <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />,
  },
  success: {
    border: 'border-green-800/40',
    bg: 'bg-card',
    icon: <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0 mt-0.5" />,
  },
  info: {
    border: 'border-brass/40',
    bg: 'bg-card',
    icon: <Info className="h-4 w-4 text-brass shrink-0 mt-0.5" />,
  },
} as const

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const style = VARIANT_STYLES[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2 px-3 py-2.5 rounded-md shadow-lg border',
              style.border,
              style.bg,
            )}
            role={t.variant === 'error' ? 'alert' : 'status'}
          >
            {style.icon}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{t.message}</div>
              {t.detail && (
                <div className="text-xs text-muted-foreground mt-0.5 break-words">{t.detail}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground transition-colors -mr-1 -mt-0.5"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
