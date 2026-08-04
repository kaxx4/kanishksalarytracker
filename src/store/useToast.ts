import { create } from 'zustand'

export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

let nextId = 1
const AUTO_DISMISS_MS = 4000

/**
 * A tiny, standalone store for save feedback — kept separate from useStore so
 * that store (Supabase-backed, app state) never needs to import this one just
 * to report on itself; instead every write site calls toast.push directly.
 */
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],

  push(kind, message) {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** Convenience so call sites read `toast.ok('Saved')` / `toast.fail(err)`. */
export const toast = {
  ok: (message: string) => useToast.getState().push('success', message),
  fail: (message: string) => useToast.getState().push('error', message),
}
