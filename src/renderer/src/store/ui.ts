import { create } from 'zustand'
import type { ReactNode } from 'react'

export type RightPanel = 'none' | 'queue' | 'nowplaying'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  divider?: boolean
  disabled?: boolean
  submenu?: MenuItem[]
}

export interface MenuPlacement {
  above?: boolean
  right?: boolean
}

export type Dialog =
  | { kind: 'confirm'; title: string; message: ReactNode; confirmLabel: string; onConfirm: () => unknown }
  | { kind: 'editPlaylist'; id: string; title: string; description?: string; thumb?: string }

interface UiStore {
  rightPanel: RightPanel
  toast: { id: number; text: string } | null
  menu: { x: number; y: number; items: MenuItem[]; place?: MenuPlacement } | null
  dialog: Dialog | null
  header: { title?: string; color?: string; play?: () => void; playing?: boolean }
  setRightPanel: (p: RightPanel) => void
  toggleRightPanel: (p: Exclude<RightPanel, 'none'>) => void
  openMenu: (x: number, y: number, items: MenuItem[], place?: MenuPlacement) => void
  closeMenu: () => void
  openDialog: (d: Dialog) => void
  closeDialog: () => void
  setHeader: (h: UiStore['header']) => void
}

function readPanel(): RightPanel {
  try {
    const v = localStorage.getItem('rightPanel')
    return v === 'queue' || v === 'nowplaying' ? v : 'nowplaying'
  } catch {
    return 'nowplaying'
  }
}

export const useUi = create<UiStore>((set, get) => ({
  rightPanel: readPanel(),
  toast: null,
  menu: null,
  dialog: null,
  header: {},
  setRightPanel(rightPanel) {
    set({ rightPanel })
    try {
      localStorage.setItem('rightPanel', rightPanel)
    } catch {
      /* ignore */
    }
  },
  toggleRightPanel(p) {
    get().setRightPanel(get().rightPanel === p ? 'none' : p)
  },
  openMenu(x, y, items, place) {
    set({ menu: { x, y, items, place } })
  },
  closeMenu() {
    set({ menu: null })
  },
  openDialog(dialog) {
    set({ dialog, menu: null })
  },
  closeDialog() {
    set({ dialog: null })
  },
  setHeader(header) {
    set({ header })
  }
}))

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string) {
  clearTimeout(toastTimer)
  useUi.setState({ toast: { id: Date.now(), text } })
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), 2800)
}
