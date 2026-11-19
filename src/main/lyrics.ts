import { app, net } from 'electron'
import type { Lyrics, LyricLine } from '../shared/types'

interface LrclibRecord {
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

const cache = new Map<string, Lyrics | null>()

export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](official|lyric|lyrics|audio|video|visuali[sz]er|music video|hd|hq|4k|remaster(ed)?)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(official|lyric).*$/i, '')
    .trim()
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

function toLyrics(rec: LrclibRecord): Lyrics | null {
  if (rec.instrumental) return { source: 'LRCLIB', plain: '♪ Instrumental ♪' }
  if (rec.syncedLyrics) return { source: 'LRCLIB', synced: parseLrc(rec.syncedLyrics), plain: rec.plainLyrics ?? undefined }
  if (rec.plainLyrics) return { source: 'LRCLIB', plain: rec.plainLyrics }
  return null
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await net.fetch(url, { headers: { 'User-Agent': `BlokTube/${app.getVersion()} (personal desktop client)` } })
  if (!res.ok) return null
  return (await res.json()) as T
}

export async function fetchLrclib(title: string, artist: string, album: string, duration: number): Promise<Lyrics | null> {
  const track = cleanTitle(title)
  const key = `${track}|${artist}|${Math.round(duration)}`
  if (cache.has(key)) return cache.get(key) ?? null

  let result: Lyrics | null = null
  const qs = new URLSearchParams({ track_name: track, artist_name: artist })
  if (album) qs.set('album_name', album)
  if (duration > 0) qs.set('duration', String(Math.round(duration)))
  const exact = await getJson<LrclibRecord>(`https://lrclib.net/api/get?${qs}`).catch(() => null)
  if (exact) result = toLyrics(exact)

  if (!result?.synced) {
    const search = new URLSearchParams({ track_name: track, artist_name: artist })
    const candidates = ((await getJson<LrclibRecord[]>(`https://lrclib.net/api/search?${search}`).catch(() => null)) ?? []).filter(
      (r) => !duration || Math.abs(r.duration - duration) <= 4
    )
    const best = candidates.find((r) => r.syncedLyrics) ?? candidates.find((r) => r.plainLyrics)
    if (best) result = toLyrics(best) ?? result
  }

  cache.set(key, result)
  return result
}
