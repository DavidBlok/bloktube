import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, session, shell, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, DownloadTarget, LikeStatus, PlayerState, PlaylistEdit, PlaylistItemRef, PlaylistMove, PlayTarget, SearchFilter, SleepTimer, Track } from '../shared/types'
import { dominantColor } from './color'
import { Engine } from './engine'
import { getSettings, updateSettings } from './settings'
import { SystemIntegration } from './system'
import { Ytm } from './ytm'

app.setName('BlokTube')
nativeTheme.themeSource = 'dark'

if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let system: SystemIntegration
let engine: Engine
let ytm: Ytm
let quitting = false
const isMac = process.platform === 'darwin'

interface SavedBounds {
  x: number
  y: number
  width: number
  height: number
  maximized?: boolean
}

const boundsFile = () => join(app.getPath('userData'), 'window.json')

function loadBounds(): SavedBounds | null {
  try {
    if (!existsSync(boundsFile())) return null
    const b = JSON.parse(readFileSync(boundsFile(), 'utf8')) as SavedBounds
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
    })
    return onScreen ? b : null
  } catch {
    return null
  }
}

function saveBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  try {
    writeFileSync(boundsFile(), JSON.stringify({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() }))
  } catch {
    /* ignore */
  }
}

function send(channel: string, payload: unknown, except?: WebContents): void {
  for (const w of [mainWindow, miniWindow]) if (w && !w.isDestroyed() && w.webContents !== except) w.webContents.send(channel, payload)
}

const loginItemSupported = process.platform === 'darwin' || process.platform === 'win32'

function currentSettings(): AppSettings {
  return { ...getSettings(), ...(loginItemSupported && { openAtLogin: app.getLoginItemSettings().openAtLogin }) }
}

function applySettings(s: AppSettings): void {
  system.setTray(s.tray)
  if (engine) engine.call('setFade', s.fadeSeconds).catch(() => undefined)
  send('settings:changed', currentSettings())
}

let lastPlayer: PlayerState | null = null
let sleepTimer: ReturnType<typeof setTimeout> | undefined
let sleepTrack: string | null = null
let sleepEndsAt: number | null = null
let sleepStopNext = false
let sleepLastPos = 0

function sleepState(): SleepTimer {
  return { endsAt: sleepEndsAt, endOfTrack: !!sleepTrack }
}

function setSleep(minutes: number | 'track' | null): SleepTimer {
  clearTimeout(sleepTimer)
  sleepTimer = undefined
  sleepEndsAt = null
  sleepTrack = null
  sleepStopNext = false
  sleepLastPos = lastPlayer?.position ?? 0
  if (minutes === 'track') sleepTrack = lastPlayer?.videoId ?? null
  else if (typeof minutes === 'number' && minutes > 0 && minutes <= 24 * 60) {
    sleepEndsAt = Date.now() + minutes * 60_000
    sleepTimer = setTimeout(() => {
      engine.call('pause').catch(() => undefined)
      setSleep(null)
    }, minutes * 60_000)
  }
  send('sleep:changed', sleepState())
  return sleepState()
}

function watchSleep(s: PlayerState): void {
  if (sleepStopNext) {
    if (s.playing && !s.buffering) {
      sleepStopNext = false
      engine.call('pause').catch(() => undefined)
    }
    return
  }
  if (!sleepTrack || !s.videoId) return
  const looped = s.videoId === sleepTrack && s.duration > 0 && sleepLastPos >= s.duration - 3 && s.position < 3
  sleepLastPos = s.position
  if (s.videoId !== sleepTrack || looped) {
    setSleep(null)
    if (looped) engine.call('pause').catch(() => undefined)
    else sleepStopNext = true
  } else if (!s.playing && s.duration > 0 && s.position >= s.duration - 1.5) setSleep(null)
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  else win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}

function guardNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
  })
}

function showMain(): void {
  if (!mainWindow) createMainWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

function toggleMini(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close()
    return
  }
  const area = screen.getPrimaryDisplay().workArea
  miniWindow = new BrowserWindow({
    width: 360,
    height: 112,
    x: area.x + area.width - 380,
    y: area.y + area.height - 132,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: !isMac,
    show: false,
    title: 'BlokTube Mini Player',
    backgroundColor: '#181818',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  })
  miniWindow.setAlwaysOnTop(true, 'floating')
  miniWindow.once('ready-to-show', () => miniWindow?.show())
  miniWindow.on('closed', () => (miniWindow = null))
  guardNavigation(miniWindow)
  loadRenderer(miniWindow, 'mini')
}

function createMainWindow(): void {
  const saved = loadBounds()
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1320,
    height: saved?.height ?? 860,
    x: saved?.x,
    y: saved?.y,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'BlokTube',
    backgroundColor: '#000000',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 20, y: 22 } : undefined,
    titleBarOverlay: isMac ? undefined : { color: '#000000', symbolColor: '#b3b3b3', height: 64 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  })
  if (saved?.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    system.thumbar()
  })
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('close', (e) => {
    saveBounds()
    const s = getSettings()
    if (!quitting && (isMac || (s.tray && s.closeToTray && system.hasTray))) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    if (!isMac) app.quit()
  })
  guardNavigation(mainWindow)
  loadRenderer(mainWindow)
}

const PLAYER_COMMANDS = new Set([
  'toggle',
  'next',
  'previous',
  'seek',
  'setVolume',
  'toggleMute',
  'toggleShuffle',
  'cycleRepeat',
  'toggleLike',
  'pause'
])
const QUEUE_COMMANDS = new Set(['queuePlayIndex', 'queueRemove', 'queueMove', 'queueClear', 'queueSetAutoplay'])

function downloadTarget(t: DownloadTarget): DownloadTarget {
  if (typeof t?.videoId === 'string' && /^[\w-]{11}$/.test(t.videoId)) return { videoId: t.videoId }
  if (typeof t?.playlistId === 'string' && /^[\w-]+$/.test(t.playlistId)) return { playlistId: t.playlistId }
  throw new Error('Invalid download target')
}

function playerCommand(method: string, ...args: unknown[]): Promise<unknown> {
  if (method === 'toggleLike') ytm.noteToggleLike()
  return engine.call(method, ...args)
}

function registerIpc(): void {
  ipcMain.handle('auth:get', () => engine.auth)
  ipcMain.handle('auth:signIn', () => engine.signIn())
  ipcMain.handle('auth:signOut', () => engine.signOut())

  ipcMain.handle('player:play', (_e, target: PlayTarget) => engine.call('play', target))
  ipcMain.handle('player:playList', (_e, videoIds: string[]) =>
    engine.call('playList', (Array.isArray(videoIds) ? videoIds : []).filter((id) => typeof id === 'string' && /^[\w-]{11}$/.test(id)))
  )
  ipcMain.handle('player:playLocal', (_e, videoIds: string[]) =>
    engine.call('playLocal', (Array.isArray(videoIds) ? videoIds : []).filter((id) => typeof id === 'string' && /^[\w-]{11}$/.test(id)))
  )
  ipcMain.handle('player:cmd', (_e, method: string, ...args: unknown[]) => {
    if (!PLAYER_COMMANDS.has(method)) throw new Error(`Unknown player command ${method}`)
    return playerCommand(method, ...args)
  })
  ipcMain.handle('player:state', () => engine.call('state'))

  ipcMain.handle('queue:get', () => engine.call('queue'))
  ipcMain.handle('downloads:get', () => engine.call('downloads'))
  ipcMain.handle('downloads:add', (_e, target: DownloadTarget) => engine.call('download', downloadTarget(target)))
  ipcMain.handle('downloads:remove', (_e, target: DownloadTarget) => engine.call('removeDownload', downloadTarget(target)))
  ipcMain.handle('downloads:clear', () => engine.call('clearDownloads'))
  ipcMain.handle('queue:add', (_e, ids: string[], next: boolean, at?: number) => engine.call('queueAdd', ids, next, at))
  ipcMain.handle('queue:cmd', (_e, method: string, ...args: unknown[]) => {
    if (!QUEUE_COMMANDS.has(method)) throw new Error(`Unknown queue command ${method}`)
    return engine.call(method, ...args)
  })

  ipcMain.handle('ytm:home', (_e, cont?: string) => ytm.home(cont))
  ipcMain.handle('ytm:browse', (_e, id: string, params?: string) => ytm.browse(id, params))
  ipcMain.handle('ytm:moods', () => ytm.moods())
  ipcMain.handle('ytm:search', (_e, q: string, filter?: SearchFilter) => ytm.search(q, filter))
  ipcMain.handle('ytm:searchMore', (_e, cont: string, filter: SearchFilter) => ytm.searchMore(cont, filter))
  ipcMain.handle('ytm:suggestions', (_e, q: string) => ytm.suggestions(q))
  ipcMain.handle('ytm:collection', (_e, id: string) => ytm.collection(id))
  ipcMain.handle('ytm:collectionMore', (_e, cont: string) => ytm.collectionMore(cont))
  ipcMain.handle('ytm:artist', (_e, id: string) => ytm.artist(id))
  ipcMain.handle('ytm:library', () => ytm.library())
  ipcMain.handle('ytm:lyrics', (_e, videoId: string, title: string, artist: string, album: string, duration: number) =>
    ytm.lyrics(videoId, title, artist, album, duration)
  )
  ipcMain.handle('ytm:rate', (_e, videoId: string, status: LikeStatus, track?: Track) => ytm.rate(videoId, status, track))
  ipcMain.handle('ytm:saveCollection', (_e, playlistId: string, save: boolean) => ytm.saveCollection(playlistId, save))
  ipcMain.handle('ytm:subscribe', (_e, channelId: string, sub: boolean) => ytm.subscribe(channelId, sub))
  ipcMain.handle('ytm:createPlaylist', async (e, title: string, videoIds?: string[]) => {
    const id = await ytm.createPlaylist(title, videoIds)
    send('playlist:changed', id.replace(/^VL/, ''), e.sender)
    return id
  })
  ipcMain.handle('ytm:addToPlaylist', async (e, playlistId: string, videoIds: string[], allowDuplicates?: boolean) => {
    const res = await ytm.addToPlaylist(playlistId, videoIds, allowDuplicates)
    if (res === 'added') send('playlist:changed', playlistId.replace(/^VL/, ''), e.sender)
    return res
  })
  ipcMain.handle('ytm:removeFromPlaylist', (_e, playlistId: string, items: PlaylistItemRef[]) => ytm.removeFromPlaylist(playlistId, items))
  ipcMain.handle('ytm:movePlaylistItems', (_e, playlistId: string, moves: PlaylistMove[]) => {
    const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 200
    if (!str(playlistId) || !Array.isArray(moves) || !moves.every((m) => str(m?.setVideoId) && (m.before === undefined || str(m.before)))) {
      throw new Error('Invalid move')
    }
    return ytm.movePlaylistItems(playlistId, moves.map((m) => ({ setVideoId: m.setVideoId, before: m.before })))
  })
  ipcMain.handle('ytm:editPlaylist', (_e, playlistId: string, edit: PlaylistEdit) => {
    if (edit?.privacy !== undefined && !['PUBLIC', 'UNLISTED', 'PRIVATE'].includes(edit.privacy)) throw new Error('Invalid privacy')
    return ytm.editPlaylist(playlistId, edit)
  })
  ipcMain.handle('ytm:deletePlaylist', (_e, playlistId: string) => ytm.deletePlaylist(playlistId))
  ipcMain.handle('ytm:history', () => ytm.history())
  ipcMain.handle('ytm:uploads', () => ytm.uploads())
  ipcMain.handle('ytm:settings', () => ytm.settings())
  ipcMain.handle('ytm:setSetting', (_e, id: string, value: boolean | string) => {
    if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new Error('Invalid setting')
    if (typeof value !== 'boolean' && !(typeof value === 'string' && /^\d+$/.test(value))) throw new Error('Invalid setting value')
    return ytm.setSetting(id, value)
  })
  ipcMain.handle('ytm:removeFromHistory', (_e, tokens: string[]) =>
    ytm.removeFromHistory((Array.isArray(tokens) ? tokens : []).filter((t) => typeof t === 'string' && t.length > 0))
  )
  ipcMain.handle('ytm:color', (_e, url: string) => dominantColor(url))

  ipcMain.handle('app:showEngine', () => engine.show())
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, platform: process.platform, loginItemSupported }))
  ipcMain.handle('app:getSettings', () => currentSettings())
  ipcMain.handle('app:setSettings', (_e, patch: Partial<AppSettings>) => {
    if (loginItemSupported && typeof patch?.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: patch.openAtLogin })
    applySettings(updateSettings(patch ?? {}))
    return currentSettings()
  })
  ipcMain.handle('app:toggleMini', () => toggleMini())
  ipcMain.handle('app:showMain', () => showMain())
  ipcMain.handle('app:popupMenu', (e, items: unknown) => {
    const window = BrowserWindow.fromWebContents(e.sender)
    if (!window || !Array.isArray(items)) return null
    return new Promise<string | null>((resolve) => {
      const template: MenuItemConstructorOptions[] = items.slice(0, 300).map((it) =>
        it?.separator ? { type: 'separator' } : { label: String(it?.label ?? ''), click: () => resolve(String(it?.id ?? '')) }
      )
      Menu.buildFromTemplate(template).popup({ window, callback: () => setTimeout(() => resolve(null), 200) })
    })
  })
  ipcMain.handle('app:confirm', async (_e, o: { title?: unknown; message?: unknown; confirmLabel?: unknown }) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: [String(o?.confirmLabel ?? 'OK'), 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: String(o?.title ?? ''),
      detail: String(o?.message ?? '')
    })
    return response === 0
  })
  ipcMain.handle('app:getSleep', () => sleepState())
  ipcMain.handle('app:setSleep', async (_e, minutes: unknown) => {
    if (minutes === 'track' && !lastPlayer?.videoId) lastPlayer = ((await engine.call('state').catch(() => null)) as PlayerState | null) ?? lastPlayer
    return setSleep(minutes === 'track' || typeof minutes === 'number' ? (minutes as number | 'track') : null)
  })
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })
}

function buildMenu(): void {
  const playback = (method: string, ...args: unknown[]) => () => playerCommand(method, ...args).catch(() => undefined)
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload', visible: !app.isPackaged },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Mini Player', accelerator: 'CmdOrCtrl+Shift+M', click: () => toggleMini() },
        { type: 'separator' },
        { label: 'Show YouTube Music Window', click: () => engine.show() },
        { label: 'YouTube Music DevTools', click: () => engine.win.webContents.openDevTools({ mode: 'detach' }) },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Playback',
      submenu: [
        { label: 'Play / Pause', accelerator: 'Space', registerAccelerator: false, click: playback('toggle') },
        { label: 'Next', accelerator: 'CmdOrCtrl+Right', registerAccelerator: false, click: playback('next') },
        { label: 'Previous', accelerator: 'CmdOrCtrl+Left', registerAccelerator: false, click: playback('previous') },
        { type: 'separator' },
        { label: 'Shuffle', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: playback('toggleShuffle') },
        { label: 'Repeat', accelerator: 'CmdOrCtrl+R', registerAccelerator: false, click: playback('cycleRepeat') },
        { label: 'Like', click: playback('toggleLike') }
      ]
    },
    {
      label: 'Account',
      submenu: [
        { label: 'Sign In…', click: () => engine.signIn() },
        { label: 'Sign Out', click: () => engine.signOut() }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('second-instance', () => showMain())

app.on('before-quit', () => {
  quitting = true
  if (engine) engine.quitting = true
})

app.on('activate', () => showMain())

const ARTWORK_URLS = [
  'https://*.googleusercontent.com/*',
  'https://*.ggpht.com/*',
  'https://*.ytimg.com/*',
  'https://*.gstatic.com/*',
  'https://music.youtube.com/image/*'
]

app.whenReady().then(() => {
  if (!app.isPackaged && process.platform === 'darwin') {
    const devIcon = join(app.getAppPath(), 'build/icon.png')
    if (existsSync(devIcon)) app.dock?.setIcon(devIcon)
  }
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ARTWORK_URLS }, (details, cb) => {
    delete details.requestHeaders['Referer']
    cb({ requestHeaders: details.requestHeaders })
  })
  system = new SystemIntegration(
    {
      command: (method) => playerCommand(method).catch(() => undefined),
      showWindow: () => showMain(),
      toggleMini: () => toggleMini(),
      quit: () => app.quit()
    },
    () => mainWindow
  )
  engine = new Engine()
  ytm = new Ytm(engine)
  engine.on('auth', (s) => {
    send('auth:changed', s)
    if (s.status === 'signed-in' || s.status === 'signed-out') engine.call('setFade', getSettings().fadeSeconds).catch(() => undefined)
  })
  engine.on('player', (s) => {
    lastPlayer = s
    send('player:state', s)
    system.update(s)
    watchSleep(s)
  })
  engine.on('queue', (q) => send('queue:changed', q))
  engine.on('downloads', (d) => send('downloads:changed', d))
  registerIpc()
  buildMenu()
  createMainWindow()
  system.setTray(getSettings().tray)
  system.refresh()
})
