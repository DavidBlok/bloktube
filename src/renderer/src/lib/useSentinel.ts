import { useEffect, useRef } from 'react'

export function useSentinel(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onVisible)
  cb.current = onVisible

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const root = el.closest('[data-scroller]')
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), {
      root,
      rootMargin: '800px 0px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])

  return ref
}
