import { useLayoutEffect, type RefObject } from 'react'

/** Grows a textarea with its content up to `maxPx`, then scrolls internally. */
export function useAutoResize(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 200) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'
  }, [ref, value, maxPx])
}
