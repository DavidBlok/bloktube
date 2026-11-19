import { nativeImage, net } from 'electron'

const cache = new Map<string, string | null>()
const ALLOWED = /(^|\.)(ytimg\.com|googleusercontent\.com|ggpht\.com)$/

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export async function dominantColor(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!
  let host = ''
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    host = u.host
  } catch {
    return null
  }
  if (!ALLOWED.test(host)) return null

  let color: string | null = null
  try {
    const res = await net.fetch(url)
    const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()))
    if (!img.isEmpty()) {
      const bmp = img.resize({ width: 24, height: 24, quality: 'good' }).toBitmap()
      let best = { score: -1, h: 0, s: 0 }
      const buckets = new Map<number, { n: number; h: number; s: number; l: number }>()
      for (let i = 0; i < bmp.length; i += 4) {
        const [h, s, l] = rgbToHsl(bmp[i + 2], bmp[i + 1], bmp[i])
        if (l < 0.08 || l > 0.92) continue
        const key = Math.round(h * 18)
        const b = buckets.get(key) ?? { n: 0, h: 0, s: 0, l: 0 }
        b.n++
        b.h += h
        b.s += s
        b.l += l
        buckets.set(key, b)
      }
      for (const b of buckets.values()) {
        const s = b.s / b.n
        const score = b.n * (0.35 + s)
        if (score > best.score) best = { score, h: b.h / b.n, s }
      }
      color = best.score < 0 ? '#535353' : hslToHex(best.h, Math.min(0.75, Math.max(0.25, best.s)), 0.36)
    }
  } catch {
    color = null
  }
  cache.set(url, color)
  return color
}
