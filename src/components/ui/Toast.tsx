import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import './Toast.css'

interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
  duration?: number
}
interface ToastItem extends ToastOptions { id: number; leaving?: boolean }

const ToastContext = createContext<(t: ToastOptions) => void>(() => {})

/** Lightweight, single-slot toast. Use for quiet confirmations of local UI actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    setToast((t) => (t ? { ...t, leaving: true } : t))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 160)
  }, [])

  const show = useCallback((t: ToastOptions) => {
    window.clearTimeout(timer.current)
    setToast({ ...t, id: ++seq.current })
    timer.current = window.setTimeout(dismiss, t.duration ?? (t.action ? 5000 : 2800))
  }, [dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast" data-leaving={toast.leaving || undefined}>
            <span className="toast__msg">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => { toast.action!.onClick(); dismiss() }}
              >
                {toast.action.label === 'Undo' && <Icon name="undo" size={15} />}
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
