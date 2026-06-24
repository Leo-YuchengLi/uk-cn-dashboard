const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  getSnapshots: () => ipcRenderer.invoke('db:snapshots'),
  deleteSnapshot: (snapshot) => ipcRenderer.invoke('db:deleteSnapshot', snapshot),
  importExcel: (geminiKey) => ipcRenderer.invoke('import:excel', geminiKey),
  onImportProgress: (cb) => {
    ipcRenderer.on('import:progress', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('import:progress')
  },
})
