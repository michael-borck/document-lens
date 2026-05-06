import { create } from 'zustand'

export type ToastVariant = 'error' | 'success' | 'info'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
  detail?: string
}

interface ToastState {
  toasts: Toast[]
  add: (variant: ToastVariant, message: string, detail?: string) => void
  dismiss: (id: string) => void
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (variant, message, detail) => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, variant, message, detail }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, variant === 'error' ? 8000 : 4000)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export { useToastStore }

export const toast = {
  error: (message: string, detail?: string) => useToastStore.getState().add('error', message, detail),
  success: (message: string, detail?: string) => useToastStore.getState().add('success', message, detail),
  info: (message: string, detail?: string) => useToastStore.getState().add('info', message, detail),
}
