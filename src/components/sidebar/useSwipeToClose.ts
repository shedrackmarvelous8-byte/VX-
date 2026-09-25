import { useEffect, type RefObject } from 'react'

/**
 * Android-style drawer dismissal: drag the panel left to close.
 * Direction-locks after a few px so vertical list scrolling is never hijacked.
 */
export function useSwipeToClose(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let x0 = 0, y0 = 0, t0 = 0, dx = 0
    let lock: 'x' | 'y' | null = null

    const start = (e: TouchEvent) => {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now()
      dx = 0; lock = null
    }
    const move = (e: TouchEvent) => {
      const mx = e.touches[0].clientX - x0
      const my = e.touches[0].clientY - y0
      if (!lock && Math.hypot(mx, my) > 8) lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (lock !== 'x') return
      dx = Math.min(0, mx)
      el.style.transition = 'none'
      el.style.transform = `translateX(${dx}px)`
      const scrim = el.previousElementSibling as HTMLElement | null
      if (scrim?.classList.contains('sidebar-scrim')) scrim.style.opacity = String(1 + dx / el.offsetWidth)
    }
    const end = () => {
      if (lock !== 'x') return
      const v = dx / (performance.now() - t0) // px/ms
      el.style.transition = ''
      el.style.transform = ''
      const scrim = el.previousElementSibling as HTMLElement | null
      if (scrim) scrim.style.opacity = ''
      if (dx < -el.offsetWidth * 0.3 || v < -0.45) onClose()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, enabled, onClose])
}
