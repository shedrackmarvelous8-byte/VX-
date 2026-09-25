import { useEffect, useRef, type ReactNode } from 'react'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Small modal built on native <dialog> (top layer, focus trap and Esc for free). */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); cancelRef.current?.focus() }
    else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      onCancel={(e) => { e.preventDefault(); onCancel() }}
      onClick={(e) => { if (e.target === ref.current) onCancel() }}
    >
      <div className="confirm__body">
        <h2 id="confirm-title" className="confirm__title">{title}</h2>
        {children && <div className="confirm__text">{children}</div>}
      </div>
      <div className="confirm__actions">
        <button ref={cancelRef} type="button" className="confirm__btn" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="confirm__btn confirm__btn--primary"
          data-danger={danger || undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
