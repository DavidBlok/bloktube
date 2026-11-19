import type { CSSProperties } from 'react'

const BLOCKS = [
  { x: 0, y: 320, col: 0 },
  { x: 0, y: 160, col: 0 },
  { x: 0, y: 0, col: 0 },
  { x: 160, y: 240, col: 1 },
  { x: 160, y: 80, col: 1 },
  { x: 320, y: 160, col: 2 },
]

export function LogoMark({ size = 24, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={`logo-mark ${animated ? 'animated' : ''}`} width={size} height={size} viewBox="0 0 456 456" aria-hidden="true">
      {BLOCKS.map((b, i) => (
        <rect
          key={i}
          className={b.col === 2 ? 'tip' : undefined}
          x={b.x}
          y={b.y}
          width={136}
          height={136}
          rx={26}
          style={{ '--i': i, '--col': b.col } as CSSProperties}
        />
      ))}
    </svg>
  )
}
