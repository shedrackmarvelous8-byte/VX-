import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    () => (typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false),
    () => false,
  )
}
