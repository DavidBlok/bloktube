import { contextBridge, ipcRenderer } from 'electron'
import type { BlokApi } from '../shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const player = (method: string, ...args: unknown[]) => invoke('player:cmd', method, ...args)
const queue = (method: string, ...args: unknown[]) => invoke('queue:cmd', method, ...args)

const api: BlokApi = {
  platform: process.platform,
  auth: {
    get: () => invoke('auth:get'),
    signIn: () => invoke('auth:signIn'),
    signOut: () => invoke('auth:signOut'),
    onChange: (cb) => listen('auth:changed', cb)
  },
  player: {
    play: (target) => invoke('player:play', target),
    playLocal: (videoIds) => invoke('player:playLocal', videoIds),
    playList: (videoIds) => invoke('player:playList', videoIds),
    toggle: () => player('toggle'),
    next: () => player('next'),
    previous: () => player('previous'),
    seek: (s) => player('seek', s),
    setVolume: (v) => player('setVolume', v),
    toggleMute: () => player('toggleMute'),
    toggleShuffle: () => player('toggleShuffle'),
    cycleRepeat: () => player('cycleRepeat'),
    toggleLike: () => player('toggleLike'),
    pause: () => player('pause'),
    getState: () => invoke('player:state'),
    onState: (cb) => listen('player:state', cb)
  },
  queue: {
    get: () => invoke('queue:get'),
    playIndex: (i) => queue('queuePlayIndex', i),
    add: (ids, next) => invoke('queue:add', ids, next),
    remove: (i) => queue('queueRemove', i),
    move: (from, to) => queue('queueMove', from, to),
    clear: () => queue('queueClear'),
    setAutoplay: (enabled) => queue('queueSetAutoplay', enabled),
    onChange: (cb) => listen('queue:changed', cb)
  },
  downloads: {
    get: () => invoke('downloads:get'),
    add: (target) => invoke('downloads:add', target),
    remove: (target) => invoke('downloads:remove', target),
    clear: () => invoke('downloads:clear'),
    onChange: (cb) => listen('downloads:changed', cb)
  },
  ytm: {
    home: (cont) => invoke('ytm:home', cont),
    browse: (id, params) => invoke('ytm:browse', id, params),
    moods: () => invoke('ytm:moods'),
    search: (q, filter) => invoke('ytm:search', q, filter),
    searchMore: (cont, filter) => invoke('ytm:searchMore', cont, filter),
    suggestions: (q) => invoke('ytm:suggestions', q),
    collection: (id) => invoke('ytm:collection', id),
    collectionMore: (cont) => invoke('ytm:collectionMore', cont),
    artist: (id) => invoke('ytm:artist', id),
    library: () => invoke('ytm:library'),
    lyrics: (videoId, title, artist, album, duration) => invoke('ytm:lyrics', videoId, title, artist, album, duration),
    rate: (videoId, status, track) => invoke('ytm:rate', videoId, status, track),
    saveCollection: (playlistId, save) => invoke('ytm:saveCollection', playlistId, save),
    subscribe: (channelId, sub) => invoke('ytm:subscribe', channelId, sub),
    createPlaylist: (title, videoIds) => invoke('ytm:createPlaylist', title, videoIds),
    addToPlaylist: (playlistId, videoIds, allowDuplicates) => invoke('ytm:addToPlaylist', playlistId, videoIds, allowDuplicates),
    removeFromPlaylist: (playlistId, items) => invoke('ytm:removeFromPlaylist', playlistId, items),
    movePlaylistItems: (playlistId, moves) => invoke('ytm:movePlaylistItems', playlistId, moves),
    editPlaylist: (playlistId, edit) => invoke('ytm:editPlaylist', playlistId, edit),
    deletePlaylist: (playlistId) => invoke('ytm:deletePlaylist', playlistId),
    history: () => invoke('ytm:history'),
    uploads: () => invoke('ytm:uploads'),
    removeFromHistory: (tokens) => invoke('ytm:removeFromHistory', tokens),
    settings: () => invoke('ytm:settings'),
    setSetting: (id, value) => invoke('ytm:setSetting', id, value),
    color: (url) => invoke('ytm:color', url)
  },
  app: {
    showEngine: () => invoke('app:showEngine'),
    openExternal: (url) => invoke('app:openExternal', url),
    info: () => invoke('app:info'),
    getSettings: () => invoke('app:getSettings'),
    setSettings: (patch) => invoke('app:setSettings', patch),
    onSettings: (cb) => listen('settings:changed', cb),
    toggleMini: () => invoke('app:toggleMini'),
    showMain: () => invoke('app:showMain'),
    getSleep: () => invoke('app:getSleep'),
    setSleep: (minutes) => invoke('app:setSleep', minutes),
    onSleep: (cb) => listen('sleep:changed', cb)
  }
}

contextBridge.exposeInMainWorld('blok', api)
