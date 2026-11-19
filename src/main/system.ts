import { app, Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions, type NativeImage } from 'electron'
import { join } from 'node:path'
import type { PlayerState } from '../shared/types'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

export interface SystemActions {
  command: (method: 'toggle' | 'next' | 'previous' | 'toggleLike') => void
  showWindow: () => void
  toggleMini: () => void
  quit: () => void
}

const shorten = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export class SystemIntegration {
  private state: PlayerState | null = null
  private tray: Tray | null = null
  private icons = new Map<string, NativeImage>()

  constructor(
    private actions: SystemActions,
    private window: () => BrowserWindow | null
  ) {}

  private icon(name: string): NativeImage {
    let img = this.icons.get(name)
    if (!img) {
      img = nativeImage.createFromPath(join(app.getAppPath(), 'resources', name))
      if (name.startsWith('trayTemplate')) img.setTemplateImage(true)
      this.icons.set(name, img)
    }
    return img
  }

  get hasTray(): boolean {
    return !!this.tray
  }

  update(s: PlayerState): void {
    const prev = this.state
    this.state = s
    if (!prev || prev.videoId !== s.videoId || prev.playing !== s.playing || prev.like !== s.like || prev.title !== s.title) this.refresh()
  }

  setTray(enabled: boolean): void {
    if (enabled && !this.tray) {
      this.tray = new Tray(this.icon(isMac ? 'trayTemplate.png' : 'tray.png'))
      if (!isMac) this.tray.on('click', () => this.actions.showWindow())
      this.refresh()
    } else if (!enabled && this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  private nowPlaying(): string | null {
    const s = this.state
    if (!s?.videoId || !s.title) return null
    const artists = s.artists.map((a) => a.name).join(', ')
    return artists ? `${s.title} — ${artists}` : s.title
  }

  private playbackItems(): MenuItemConstructorOptions[] {
    const s = this.state
    const has = !!s?.videoId
    const now = this.nowPlaying()
    return [
      ...(now ? [{ label: shorten(now), enabled: false }, { type: 'separator' as const }] : []),
      { label: s?.playing ? 'Pause' : 'Play', enabled: has, click: () => this.actions.command('toggle') },
      { label: 'Next', enabled: has, click: () => this.actions.command('next') },
      { label: 'Previous', enabled: has, click: () => this.actions.command('previous') },
      { type: 'separator' },
      {
        label: s?.like === 'LIKE' ? 'Remove from Liked Songs' : 'Save to Liked Songs',
        enabled: has,
        click: () => this.actions.command('toggleLike')
      }
    ]
  }

  refresh(): void {
    if (isMac) app.dock?.setMenu(Menu.buildFromTemplate(this.playbackItems()))
    if (this.tray) {
      this.tray.setContextMenu(
        Menu.buildFromTemplate([
          ...this.playbackItems(),
          { type: 'separator' },
          { label: 'Show BlokTube', click: () => this.actions.showWindow() },
          { label: 'Mini Player', click: () => this.actions.toggleMini() },
          { type: 'separator' },
          { label: 'Quit BlokTube', click: () => this.actions.quit() }
        ])
      )
      this.tray.setToolTip(this.nowPlaying() ?? 'BlokTube')
    }
    this.thumbar()
  }

  thumbar(): void {
    const win = this.window()
    if (!isWin || !win || win.isDestroyed()) return
    const s = this.state
    const flags: ('disabled' | 'enabled')[] = s?.videoId ? ['enabled'] : ['disabled']
    win.setThumbarButtons([
      { tooltip: 'Previous', icon: this.icon('prev.png'), flags, click: () => this.actions.command('previous') },
      { tooltip: s?.playing ? 'Pause' : 'Play', icon: this.icon(s?.playing ? 'pause.png' : 'play.png'), flags, click: () => this.actions.command('toggle') },
      { tooltip: 'Next', icon: this.icon('next.png'), flags, click: () => this.actions.command('next') }
    ])
  }
}
