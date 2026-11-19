import { create } from 'zustand'
import type { AppInfo, AppSettings } from '@shared/types'
import { blok, errorMessage } from '../api'
import { toast } from '../store/ui'

interface AppSettingsStore {
  settings: AppSettings | null
  info: AppInfo | null
}

export const useAppSettings = create<AppSettingsStore>(() => ({ settings: null, info: null }))

export const ACCENTS = [
  { name: 'Green', value: '#1ed760' },
  { name: 'Blue', value: '#3d91f4' },
  { name: 'Purple', value: '#9b6bff' },
  { name: 'Pink', value: '#ff4fa3' },
  { name: 'Red', value: '#ff5252' },
  { name: 'Orange', value: '#ff8a3d' },
  { name: 'Yellow', value: '#f5c518' },
  { name: 'Teal', value: '#2dd4bf' }
]

function lighten(hex: string, amount = 0.18): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function apply(s: AppSettings) {
  useAppSettings.setState({ settings: s })
  const root = document.documentElement.style
  root.setProperty('--accent', s.accent)
  root.setProperty('--accent-hover', lighten(s.accent))
}

export function initAppSettings() {
  blok.app.getSettings().then(apply).catch(() => undefined)
  blok.app
    .info()
    .then((info) => useAppSettings.setState({ info }))
    .catch(() => undefined)
  blok.app.onSettings(apply)
}

export async function updateAppSettings(patch: Partial<AppSettings>) {
  try {
    apply(await blok.app.setSettings(patch))
  } catch (e) {
    toast(errorMessage(e))
  }
}
