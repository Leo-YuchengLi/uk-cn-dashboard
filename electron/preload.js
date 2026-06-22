const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  getSnapshots: () => ipcRenderer.invoke('db:snapshots'),
  importExcel: () => ipcRenderer.invoke('import:excel'),
  onImportProgress: (cb) => {
    ipcRenderer.on('import:progress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('import:progress')
  },
})
