import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import './Sheet.css'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Sticky action row at the bottom of the sheet */
  footer?: ReactNode
}

/**
 * Modal sheet built on the native <dialog> top layer (focus trap + Esc for free).
 * Bottom sheet on phones, centered panel from 640px up. Smooth open *and* close.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useRef<number | null>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const cancelClose = () => {
      if (closing.current != null) {
        window.clearTimeout(closing.current)
        closing.current = null
        d.removeAttribute('data-closing')
      }
    }
    if (open) {
      cancelClose()
      if (!d.open) d.showModal()
    } else if (d.open) {
      if (closing.current == null) {
        d.setAttribute('data-closing', '')
        closing.current = window.setTimeout(() => {
          closing.current = null
          d.removeAttribute('data-closing')
          if (d.open) d.close()
        }, 170)
      }
    }
    return cancelClose
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="sheet__panel">
        <div className="sheet__grab" aria-hidden="true" />
        <header className="sheet__head">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          <IconButton icon="close" label="Close" size="sm" onClick={onClose} />
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </dialog>
  )
}
