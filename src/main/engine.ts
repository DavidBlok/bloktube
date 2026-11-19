import { BrowserWindow, ipcMain, session, shell } from 'electron'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import bridge from '../engine/bridge.js?raw'
import type { AuthState } from '../shared/types'
import { parseAccount } from '../shared/ytm/parse'

const YTM = 'https://music.youtube.com/'
const SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=' +
  encodeURIComponent(`https://www.youtube.com/signin?action_handle_signin=true&next=${encodeURIComponent(YTM)}`)
const PARTITION = 'persist:ytm'
const ENGINE_EVENTS = new Set(['ready', 'player', 'queue', 'downloads'])

export class Engine extends EventEmitter {
  win: BrowserWindow
  auth: AuthState = { status: 'starting' }
  quitting = false
  private ready = false
  private waiters: Array<() => void> = []
  private shownForAuth = false

  constructor() {
    super()
    const ses = session.fromPartition(PARTITION)
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media' || permission === 'fullscreen'))

    this.win = new BrowserWindow({
      show: false,
      width: 1000,
      height: 760,
      title: 'YouTube Music',
      backgroundColor: '#030303',
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        preload: join(__dirname, '../preload/engine.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false
      }
    })

    this.win.on('close', (e) => {
      if (this.quitting) return
      e.preventDefault()
      this.win.hide()
      this.shownForAuth = false
    })

    const wc = this.win.webContents
    wc.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.ready = false
    })
    wc.on('did-navigate', (_e, url) => this.onNavigate(url))
    wc.on('did-finish-load', () => this.inject())
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return
      this.setAuth({ status: 'error', message: `Could not reach YouTube Music (${desc})` })
      setTimeout(() => {
        if (!this.ready) this.win.loadURL(url || YTM)
      }, 5000)
    })
    wc.on('render-process-gone', () => {
      this.ready = false
      setTimeout(() => this.win.loadURL(YTM), 1000)
    })

    ipcMain.on('engine:event', (e, type: string, payload: unknown) => {
      if (e.sender !== wc || !ENGINE_EVENTS.has(type)) return
      this.onEvent(type, payload)
    })

    this.skipConsent().finally(() => this.win.loadURL(YTM))
  }

  private async skipConsent(): Promise<void> {
    const ses = this.win.webContents.session
    const existing = await ses.cookies.get({ name: 'SOCS' }).catch(() => [])
    if (existing.length) return
    await ses.cookies
      .set({
        url: 'https://www.youtube.com',
        domain: '.youtube.com',
        name: 'SOCS',
        value: 'CAI',
        secure: true,
        sameSite: 'lax',
        expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 390
      })
      .catch(() => undefined)
  }

  private host(url: string): string {
    try {
      return new URL(url).host
    } catch {
      return ''
    }
  }

  private onNavigate(url: string): void {
    const host = this.host(url)
    if (host === 'consent.youtube.com' || host === 'consent.google.com') {
      this.setAuth({ status: 'consent' })
      this.reveal()
    } else if (host === 'accounts.google.com') {
      this.setAuth({ status: 'signing-in' })
      this.reveal()
    }
  }

  private reveal(): void {
    this.shownForAuth = true
    this.win.center()
    this.win.show()
    this.win.focus()
  }

  private inject(): void {
    const url = this.win.webContents.getURL()
    if (this.host(url) !== 'music.youtube.com') return
    this.win.webContents.executeJavaScript(bridge, true).catch(() => undefined)
  }

  private async onEvent(type: string, payload: unknown): Promise<void> {
    if (type === 'ready') {
      this.ready = true
      const waiters = this.waiters
      this.waiters = []
      waiters.forEach((w) => w())
      if ((payload as { loggedIn?: boolean })?.loggedIn) {
        let account
        try {
          account = parseAccount(await this.fetch('/account/account_menu', {}))
        } catch {
          account = undefined
        }
        this.setAuth({ status: 'signed-in', account })
      } else {
        this.setAuth({ status: 'signed-out' })
      }
      if (this.shownForAuth) {
        this.shownForAuth = false
        this.win.hide()
      }
    } else if (type === 'player') this.emit('player', payload)
    else if (type === 'queue') this.emit('queue', payload)
    else if (type === 'downloads') this.emit('downloads', payload)
  }

  private setAuth(state: AuthState): void {
    this.auth = state
    this.emit('auth', state)
  }

  private whenReady(timeoutMs = 30_000): Promise<void> {
    if (this.ready) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('YouTube Music is not ready yet')), timeoutMs)
      this.waiters.push(() => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    await this.whenReady()
    const code = `window.__blok.${method}(...${JSON.stringify(args)})`
    return this.win.webContents.executeJavaScript(code, true) as Promise<T>
  }

  fetch<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.call<T>('fetch', path, body)
  }

  signIn(): void {
    this.shownForAuth = true
    this.win.loadURL(SIGN_IN_URL)
    this.reveal()
  }

  async signOut(): Promise<void> {
    await this.win.webContents.session.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers']
    })
    this.setAuth({ status: 'starting' })
    await this.skipConsent()
    this.win.loadURL(YTM)
  }

  show(): void {
    this.win.show()
    this.win.focus()
  }
}
