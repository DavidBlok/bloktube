import type { BlokApi } from '@shared/types'

declare global {
  interface Window {
    blok: BlokApi
  }
}

export const blok = window.blok

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
