import React, { useState, useEffect } from 'react'
import { getSheetData } from '../utils/db'
import { CA_RED } from '../utils/colors'
import { useLang } from '../utils/i18n'

const SHEET_TABS = [
  { id: 'raw_month_share',   label: 'Month share - Pax' },
  { id: 'raw_all_agts',      label: 'ALL AGTS' },
  { id: 'raw_top30_od_all',  label: 'TOP 30 OD - ALL' },
  { id: 'raw_consol',        label: 'CONSOL' },
  { id: 'raw_top30_od_ota',  label: 'TOP 30 OD - OTA' },
  { id: 'raw_ota',           label: 'OTA' },
  { id: 'raw_tmc',           label: 'TMC' },
  { id: 'raw_trip_com',      label: 'Trip.com' },
]

function isNumeric(v) {
  return typeof v === 'number' && !isNaN(v)
}

function isPct(v) {
  return isNumeric(v) && v >= -1 && v <= 1 && v !== 0 && !Number.isInteger(v)
}

function formatCell(v) {
  if (v === null || v === undefined) return ''
  if (isPct(v)) return (v * 100).toFixed(1) + '%'
  if (isNumeric(v)) {
    if (Number.isInteger(v)) return v.toLocaleString()
    // Float but not percentage-range: show 2 decimals
    return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  }
  return String(v)
}

function cellStyle(v) {
  const base = {
    padding: '4px 8px',
    borderBottom: '1px solid #e5e7eb',
    borderRight: '1px solid #f3f4f6',
    fontSize: 12,
    whiteSpace: 'nowrap',
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
  if (isNumeric(v)) {
    base.textAlign = 'right'
    base.fontVariantNumeric = 'tabular-nums'
  } else {
    base.textAlign = 'left'
  }
  return base
}

function findHeaderRow(grid) {
  // First row that has at least 2 non-null cells
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const filled = grid[i].filter(c => c !== null && c !== undefined).length
    if (filled >= 2) return i
  }
  return 0
}

export default function RawData({ snapshot }) {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState(SHEET_TABS[0].id)
  const [grid, setGrid] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!snapshot) return
    setLoading(true)
    setError(null)
    getSheetData(activeTab, snapshot)
      .then(data => {
        setGrid(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setGrid(null)
        setLoading(false)
      })
  }, [activeTab, snapshot])

  const headerRowIdx = grid ? findHeaderRow(grid) : 0

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
        {t('rawdata_title')}
      </h2>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap',
        borderBottom: '2px solid #e5e7eb', paddingBottom: 0,
      }}>
        {SHEET_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === t.id ? `3px solid ${CA_RED}` : '3px solid transparent',
              background: activeTab === t.id ? '#fef2f2' : 'transparent',
              color: activeTab === t.id ? CA_RED : '#6b7280',
              fontWeight: activeTab === t.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: '#dc2626', background: '#fef2f2', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!loading && !error && grid && (
        <div style={{
          overflow: 'auto',
          maxHeight: 'calc(100vh - 200px)',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: 'white',
        }}>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontSize: 12,
          }}>
            <tbody>
              {grid.map((row, ri) => {
                const isHeader = ri === headerRowIdx
                return (
                  <tr
                    key={ri}
                    style={{
                      background: isHeader ? '#f9fafb' : ri % 2 === 0 ? 'white' : '#fafbfc',
                      ...(isHeader ? { position: 'sticky', top: 0, zIndex: 10 } : {}),
                    }}
                  >
                    {row.map((cell, ci) => {
                      const Tag = isHeader ? 'th' : 'td'
                      return (
                        <Tag
                          key={ci}
                          style={{
                            ...cellStyle(cell),
                            ...(isHeader ? {
                              fontWeight: 700,
                              background: '#f3f4f6',
                              borderBottom: '2px solid #d1d5db',
                              position: 'sticky',
                              top: 0,
                              zIndex: 10,
                            } : {}),
                          }}
                          title={cell !== null && cell !== undefined ? String(cell) : ''}
                        >
                          {formatCell(cell)}
                        </Tag>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && !grid && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          No data available for this sheet.
        </div>
      )}
    </div>
  )
}
