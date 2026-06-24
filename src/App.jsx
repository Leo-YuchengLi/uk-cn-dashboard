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
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')

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

  const saveGeminiKey = (key) => {
    localStorage.setItem('gemini_key', key)
    setGeminiKey(key)
    setShowKeyInput(false)
  }

  const handleImport = async () => {
    if (!window.api) return alert('Please run in Electron to import Excel')
    if (!geminiKey) {
      setKeyDraft('')
      setShowKeyInput(true)
      return
    }
    setImporting(true)
    setImportLog('')

    const unsub = window.api.onImportProgress((msg) => {
      setImportLog(prev => prev + msg)
    })

    try {
      const result = await window.api.importExcel(geminiKey)
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
          {/* Gemini API Key status */}
          <div style={{ padding: '0 0 8px', fontSize: 11 }}>
            {geminiKey ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#4ade80' }}>Gemini API Key ✓</span>
                <button onClick={() => { setKeyDraft(''); setShowKeyInput(true) }} style={{
                  background: 'none', border: 'none', color: '#9ca3af',
                  fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
                }}>{lang === 'zh' ? '修改' : 'Change'}</button>
              </div>
            ) : (
              <button onClick={() => { setKeyDraft(''); setShowKeyInput(true) }} style={{
                width: '100%', padding: '6px', borderRadius: 4,
                background: 'var(--gray-800)', color: '#fbbf24',
                border: '1px solid var(--gray-600)', fontSize: 11,
                cursor: 'pointer',
              }}>{lang === 'zh' ? '设置 Gemini API Key' : 'Set Gemini API Key'}</button>
            )}
          </div>

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

      {showKeyInput && (
        <div className="import-overlay" onClick={() => setShowKeyInput(false)}>
          <div className="import-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: 8 }}>Gemini API Key</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              {lang === 'zh'
                ? '导入 Excel 数据需要 Gemini API Key 进行 AI 智能解析。'
                : 'Gemini API Key is required for AI-powered Excel data import.'}
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder="AIza..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && keyDraft.trim()) saveGeminiKey(keyDraft.trim()) }}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: '1px solid #d1d5db', fontSize: 13,
                marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowKeyInput(false)} style={{
                padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                background: 'white', cursor: 'pointer', fontSize: 12,
              }}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button onClick={() => keyDraft.trim() && saveGeminiKey(keyDraft.trim())} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none',
                background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: 12,
              }}>{lang === 'zh' ? '保存' : 'Save'}</button>
              {geminiKey && (
                <button onClick={() => { localStorage.removeItem('gemini_key'); setGeminiKey(''); setShowKeyInput(false) }} style={{
                  padding: '6px 16px', borderRadius: 6, border: '1px solid #ef4444',
                  background: 'white', color: '#ef4444', cursor: 'pointer', fontSize: 12,
                }}>{lang === 'zh' ? '清除' : 'Clear'}</button>
              )}
            </div>
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
