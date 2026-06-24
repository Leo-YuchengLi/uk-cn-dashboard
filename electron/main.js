const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { execFile, exec } = require('child_process')
const fs = require('fs')
const Database = require('better-sqlite3')

// Paths adapt to packaged vs dev mode
const isPackaged = app.isPackaged
const RESOURCES = isPackaged
  ? path.join(process.resourcesPath, 'app-resources')
  : path.join(__dirname, '..')

const isDev = process.env.NODE_ENV === 'development' || !isPackaged
const DB_DIR = isDev
  ? path.join(__dirname, '..', 'data')
  : path.join(app.getPath('userData'), 'data')
const DB_PATH = path.join(DB_DIR, 'airline.db')
const PYTHON_DIR = path.join(RESOURCES, 'python')

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

// Set dock icon on macOS
if (process.platform === 'darwin') {
  const iconPath = path.join(RESOURCES, 'public', 'app-icon.png')
  if (fs.existsSync(iconPath)) app.dock?.setIcon(iconPath)
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'UK-CN 航线周报看板',
    icon: path.join(RESOURCES, 'build', 'icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ─── IPC: Database queries ───

function getDb() {
  console.log('[DB] Path:', DB_PATH, 'Exists:', fs.existsSync(DB_PATH))
  if (!fs.existsSync(DB_PATH)) return null
  return new Database(DB_PATH, { readonly: true })
}

ipcMain.handle('db:query', (_, sql, params = []) => {
  try {
    const db = getDb()
    if (!db) return { ok: true, data: [] }
    const rows = db.prepare(sql).all(...params)
    db.close()
    return { ok: true, data: rows }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('db:snapshots', () => {
  try {
    const db = getDb()
    if (!db) return { ok: true, data: [] }
    const rows = db.prepare('SELECT * FROM snapshots ORDER BY snapshot_date DESC').all()
    db.close()
    return { ok: true, data: rows }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── Python detection ───

function findPython() {
  // Try common Python paths
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python']

  return new Promise((resolve) => {
    let tried = 0
    for (const cmd of candidates) {
      exec(`${cmd} --version`, (err, stdout) => {
        tried++
        if (!err && stdout.includes('Python 3')) {
          resolve(cmd.split(' ')[0] === 'py' ? 'py' : cmd)
          return
        }
        if (tried === candidates.length) resolve(null)
      })
    }
  })
}

// ─── Binary parser detection ───

function findBinary(name) {
  // Look for compiled binary in resources (packaged) or dist/ (dev)
  const ext = process.platform === 'win32' ? '.exe' : ''
  const candidates = [
    path.join(RESOURCES, 'bin', `${name}${ext}`),
    path.join(__dirname, '..', 'dist-bin', `${name}${ext}`),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ─── IPC: Import Excel ───

ipcMain.handle('import:excel', async () => {
  // Check for compiled binaries first, then fall back to Python
  const parserBin = findBinary('parser-bin')
  const sheetBin = findBinary('sheet-parser-bin')
  const hasBinaries = parserBin && sheetBin

  let pythonCmd = null
  if (!hasBinaries) {
    pythonCmd = await findPython()
    if (!pythonCmd) {
      return {
        ok: false,
        error: '未检测到解析器。\n\n' +
          '方案1: 下载包含内置解析器的完整版安装包\n\n' +
          '方案2: 安装 Python 3.9+ (https://www.python.org/downloads/)\n' +
          '然后运行: pip install pandas openpyxl python-calamine',
      }
    }
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择周报 Excel 文件',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: 'cancelled' }
  }

  const filePath = result.filePaths[0]

  // Run parser: prefer binary, fallback to Python
  const runParser = (binPath, pyScript) => {
    let cmd, args
    if (binPath && hasBinaries) {
      cmd = binPath
      args = [filePath, '--db', DB_PATH]
    } else {
      const script = path.join(PYTHON_DIR, pyScript)
      if (process.platform === 'win32' && pythonCmd === 'py') {
        cmd = 'py'
        args = ['-3', script, filePath, '--db', DB_PATH]
      } else {
        cmd = pythonCmd
        args = [script, filePath, '--db', DB_PATH]
      }
    }

    return new Promise((resolve) => {
      const proc = execFile(cmd, args, {
        timeout: 600000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, DB_PATH },
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: stderr || error.message })
        } else {
          const lines = stdout.trim().split('\n')
          const lastLine = lines[lines.length - 1]
          try {
            const data = JSON.parse(lastLine)
            resolve({ ok: true, data, log: stdout })
          } catch {
            resolve({ ok: true, data: null, log: stdout })
          }
        }
      })

      if (proc.stdout) {
        proc.stdout.on('data', (chunk) => {
          mainWindow.webContents.send('import:progress', chunk.toString())
        })
      }
    })
  }

  // Run main parser
  const mainResult = await runParser(parserBin, 'parser.py')
  if (!mainResult.ok) return mainResult

  // Run sheet parser
  mainWindow.webContents.send('import:progress', '\n[Sheet Parser] Parsing pivot tables...\n')
  const sheetResult = await runParser(sheetBin, 'sheet_parser.py')

  return mainResult
})

// ─── IPC: Get DB path (for Python scripts) ───
ipcMain.handle('app:dbpath', () => DB_PATH)
