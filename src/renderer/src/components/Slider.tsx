import { useRef, useState, type PointerEvent } from 'react'

interface Props {
  value: number
  max: number
  onChange?: (v: number) => void
  onCommit: (v: number) => void
  className?: string
  label?: string
}

export function Slider({ value, max, onChange, onCommit, className = '', label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? value
  const pct = max > 0 ? Math.max(0, Math.min(100, (shown / max) * 100)) : 0

  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max
  }

  return (
    <div
      ref={ref}
      className={`slider ${drag !== null ? 'dragging' : ''} ${className}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      onPointerDown={(e) => {
        if (max <= 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const v = at(e)
        setDrag(v)
        onChange?.(v)
      }}
      onPointerMove={(e) => {
        if (drag === null) return
        const v = at(e)
        setDrag(v)
        onChange?.(v)
      }}
      onPointerUp={(e) => {
        if (drag === null) return
        const v = at(e)
        setDrag(null)
        onCommit(v)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  )
}
