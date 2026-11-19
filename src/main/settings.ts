import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../shared/types'

export const DEFAULT_SETTINGS: AppSettings = { tray: false, closeToTray: false, accent: '#1ed760', fadeSeconds: 0 }

const file = () => join(app.getPath('userData'), 'settings.json')
let cache: AppSettings | null = null

function sanitize(patch: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {}
  if (typeof patch.tray === 'boolean') out.tray = patch.tray
  if (typeof patch.closeToTray === 'boolean') out.closeToTray = patch.closeToTray
  if (typeof patch.accent === 'string' && /^#[0-9a-f]{6}$/i.test(patch.accent)) out.accent = patch.accent.toLowerCase()
  if (typeof patch.fadeSeconds === 'number' && Number.isFinite(patch.fadeSeconds)) out.fadeSeconds = Math.max(0, Math.min(12, Math.round(patch.fadeSeconds)))
  return out
}

export function getSettings(): AppSettings {
  if (!cache) {
    try {
      cache = { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(readFileSync(file(), 'utf8'))) }
    } catch {
      cache = { ...DEFAULT_SETTINGS }
    }
  }
  return cache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cache = { ...getSettings(), ...sanitize(patch) }
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch {
    /* ignore */
  }
  return cache
}
