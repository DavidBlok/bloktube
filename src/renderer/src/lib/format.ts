import type { Ref } from '@shared/types'

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export const artistNames = (artists: Ref[] | undefined): string => (artists ?? []).map((a) => a.name).join(', ')

export function hiRes(url: string | undefined, size: number): string | undefined {
  if (!url) return url
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+(?=[-&]|$)/, `=s${size}`)
  }
  return url
}

export function titleSize(title: string): string {
  const n = title.length
  if (n <= 12) return 'xl'
  if (n <= 24) return 'lg'
  if (n <= 40) return 'md'
  return 'sm'
}

export function formatTotal(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  return h ? `${unit(h, 'hour')}, ${unit(m, 'minute')}` : unit(Math.max(1, m), 'minute')
}
