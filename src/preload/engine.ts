import { ipcRenderer } from 'electron'

window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== location.origin) return
  const data = e.data
  if (!data || data.__blokEngine !== true || typeof data.type !== 'string') return
  ipcRenderer.send('engine:event', data.type, data.payload)
})
