import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => 'pong',
  captureScreen: () => ipcRenderer.invoke('capture-screen') as Promise<string | null>
})
