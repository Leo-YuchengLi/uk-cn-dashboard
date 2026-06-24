import React, { useState, useEffect, useCallback } from 'react'
import Overview from './pages/Overview'
import CityPair from './pages/CityPair'
import Channel from './pages/Channel'
import Agent from './pages/Agent'
import Trend from './pages/Trend'
import RawData from './pages/RawData'
import AIChat from './pages/AIChat'
import { getSnapshots } from './utils/db'
import { LangProvider, useLang } from './utils/i18n'

const TAB_KEYS = [
  { id: 'overview', labelKey: 'tab_overview', icon: '◉' },
  { id: 'citypair', labelKey: 'tab_citypair', icon: '⬡' },
  { id: 'channel',  labelKey: 'tab_channel', icon: '◫' },
  { id: 'agent',    labelKey: 'tab_agent', icon: '◈' },
  { id: 'trend',    labelKey: 'tab_trend', icon: '∿' },
  { id: 'rawdata',  labelKey: 'tab_rawdata', icon: '≡' },
  { id: 'ai',       labelKey: 'tab_ai', icon: '◇' },
]

function Dashboard() {
  const { lang, toggleLang, t } = useLang()
  const [tab, setTab] = useState('overview')
  const [snapshots, setSnapshots] = useState([])
  const [currentSnapshot, setCurrentSnapshot] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState('')

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await getSnapshots()
      setSnapshots(data)
      if (data.length > 0 && !currentSnapshot) {
        setCurrentSnapshot(data[0].snapshot_date)
      }
    } catch (e) {
      console.error('Failed to load snapshots:', e)
    }
  }, [currentSnapshot])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  const handleImport = async () => {
    if (!window.api) return alert('Please run in Electron to import Excel')
    setImporting(true)
    setImportLog('')

    const unsub = window.api.onImportProgress((msg) => {
      setImportLog(prev => prev + msg)
    })

    try {
      const result = await window.api.importExcel()
      if (result.ok) {
        setImportLog(prev => prev + '\n✅ Done!')
        await loadSnapshots()
        if (result.data?.snapshot_date) {
          setCurrentSnapshot(result.data.snapshot_date)
        }
      } else if (result.error !== 'cancelled') {
        setImportLog(prev => prev + '\n❌ ' + result.error)
      }
    } catch (e) {
      setImportLog(prev => prev + '\n❌ ' + e.message)
    }

    unsub()
    setTimeout(() => setImporting(false), 2000)
  }

  const prevSnapshot = snapshots.length > 1
    ? snapshots.find(s => s.snapshot_date < currentSnapshot)?.snapshot_date
    : null

  const renderPage = () => {
    if (!currentSnapshot) {
      return (
        <div className="empty-state">
          <div className="icon" style={{ fontSize: 48, color: '#9ca3af' }}>[ ]</div>
          <h3>{t('no_data_title')}</h3>
          <p>{t('no_data_desc')}</p>
        </div>
      )
    }

    const props = { snapshot: currentSnapshot, prevSnapshot }
    switch (tab) {
      case 'overview': return <Overview {...props} />
      case 'citypair': return <CityPair {...props} />
      case 'channel':  return <Channel {...props} />
      case 'agent':    return <Agent {...props} />
      case 'trend':    return <Trend {...props} />
      case 'rawdata':  return <RawData {...props} />
      case 'ai':       return <AIChat {...props} />
      default: return null
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="./app-icon.png" alt="" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <div>
              <h1>{t('app_title')}</h1>
              <div className="subtitle">{t('app_subtitle')}</div>
            </div>
          </div>
        </div>

        {/* Language toggle */}
        <div style={{ padding: '8px 20px' }}>
          <button onClick={toggleLang} style={{
            width: '100%', padding: '6px', borderRadius: 6,
            background: 'var(--gray-800)', color: 'white',
            border: '1px solid var(--gray-600)', fontSize: 12,
            cursor: 'pointer', fontWeight: 600, letterSpacing: 1,
          }}>
            {lang === 'zh' ? '切换 English' : '切换中文'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {TAB_KEYS.map(tk => (
            <div
              key={tk.id}
              className={`nav-item ${tab === tk.id ? 'active' : ''}`}
              onClick={() => setTab(tk.id)}
            >
              <span className="icon">{tk.icon}</span>
              {t(tk.labelKey)}
            </div>
          ))}
        </nav>

        {snapshots.length > 0 && (
          <div style={{ padding: '0 20px 12px' }}>
            <select
              value={currentSnapshot || ''}
              onChange={e => setCurrentSnapshot(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 6,
                background: 'var(--gray-800)', color: 'white', border: '1px solid var(--gray-600)',
                fontSize: 12,
              }}
            >
              {snapshots.map(s => (
                <option key={s.snapshot_date} value={s.snapshot_date}>
                  {s.snapshot_date} ({s.total_pax?.toLocaleString()} Pax)
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!currentSnapshot || !window.api) return
                const yes = confirm(lang === 'zh'
                  ? `确定删除快照 ${currentSnapshot} 的所有数据？此操作不可撤销。`
                  : `Delete all data for snapshot ${currentSnapshot}? This cannot be undone.`)
                if (!yes) return
                const result = await window.api.deleteSnapshot(currentSnapshot)
                if (result.ok) {
                  await loadSnapshots()
                  setCurrentSnapshot(null)
                }
              }}
              style={{
                width: '100%', marginTop: 6, padding: '5px', borderRadius: 4,
                background: 'transparent', color: '#9ca3af', border: '1px solid var(--gray-700)',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              {lang === 'zh' ? '删除当前快照' : 'Delete Current Snapshot'}
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <button className="import-btn" onClick={handleImport} disabled={importing}>
            {importing ? t('btn_importing') : t('btn_import')}
          </button>
          {currentSnapshot && (
            <div className="snapshot-info">
              {t('current_snapshot')}: {currentSnapshot}
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>

      {importing && importLog && (
        <div className="import-overlay">
          <div className="import-modal">
            <h3>{importing ? t('btn_importing') : 'Done'}</h3>
            <div className="import-log">{importLog}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <Dashboard />
    </LangProvider>
  )
}
