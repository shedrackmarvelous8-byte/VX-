import { useEffect } from 'react'

/**
 * Keyboard-safe layout: tracks the *visual* viewport height so the composer stays
 * pinned above the on-screen keyboard (Android + iOS). Writes `--app-height`.
 */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    const update = () => {
      const h = vv ? vv.height : window.innerHeight
      root.style.setProperty('--app-height', `${Math.round(h)}px`)
      if (vv && vv.offsetTop) window.scrollTo(0, 0)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
}
