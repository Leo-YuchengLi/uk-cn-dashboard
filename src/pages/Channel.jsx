import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { getSheetData } from '../utils/db'
import { CA_RED, getAirlineColor, fmtPct, fmtNum } from '../utils/colors'
import { useLang } from '../utils/i18n'

const CHANNEL_TABS = [
  { id: 'ota', label: 'OTA' },
  { id: 'consol', label: 'CONSOL' },
  { id: 'tmc', label: 'TMC' },
  { id: 'trip', label: 'Trip.com' },
]

function getSortOptions(t) {
  return [
    { id: 'total_desc', label: t('sort_total_desc') },
    { id: 'ca_pct_desc', label: t('sort_ca_pct_desc') },
    { id: 'ca_pax_desc', label: t('sort_ca_pax_desc') },
  ]
}

function SortButtons({ sort, setSort, t }) {
  const SORT_OPTIONS = getSortOptions(t)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {SORT_OPTIONS.map(o => (
        <button key={o.id} onClick={() => setSort(o.id)} style={{
          padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4,
          background: sort === o.id ? CA_RED : 'white',
          color: sort === o.id ? 'white' : '#6b7280',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function sortItems(items, sort, airlines, nameKey) {
  const filtered = items.filter(i => i[nameKey] !== 'TOTAL' && i[nameKey] !== 'Total')
  return [...filtered].sort((a, b) => {
    if (sort === 'ca_pct_desc') {
      const aShare = (a.total || 0) > 0 ? (a.CA || 0) / a.total : 0
      const bShare = (b.total || 0) > 0 ? (b.CA || 0) / b.total : 0
      return bShare - aShare
    }
    if (sort === 'ca_pax_desc') return (b.CA || 0) - (a.CA || 0)
    return (b.total || 0) - (a.total || 0)
  })
}

function ShareTable({ title, items, nameKey, airlines, sort, setSort, t }) {
  if (!items || items.length === 0) return null
  const sorted = sortItems(items, sort, airlines, nameKey)
  const totalRow = items.find(i => i[nameKey] === 'TOTAL' || i[nameKey] === 'Total')

  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <div className="chart-title">
        {title}
        <SortButtons sort={sort} setSort={setSort} t={t} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="row-header" style={{ minWidth: 180 }}>{t('col_name')}</th>
              <th>{t('col_total')}</th>
              {airlines.map(al => (
                <th key={al} style={{
                  color: al === 'CA' ? CA_RED : undefined,
                  fontWeight: al === 'CA' ? 800 : 600,
                }}>{al}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => {
              const caShare = (item.total || 0) > 0 ? (item.CA || 0) / item.total * 100 : 0
              return (
                <tr key={i}>
                  <td className="row-header" style={{ fontSize: 11 }}>
                    {(item[nameKey] || '').length > 30 ? item[nameKey].substring(0, 30) + '...' : item[nameKey]}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{fmtNum(item.total || 0)}</td>
                  {airlines.map(al => {
                    const pax = item[al] || 0
                    const share = (item.total || 0) > 0 ? pax / item.total * 100 : 0
                    const isCA = al === 'CA'
                    return (
                      <td key={al} style={{
                        fontWeight: isCA ? 700 : 400,
                        color: isCA && share > 35 ? CA_RED : isCA ? '#374151' : '#6b7280',
                        fontSize: 12,
                      }} title={`${fmtNum(pax)} Pax`}>
                        {pax > 0 ? `${fmtPct(share, 0)}` : '–'}
                        {isCA && pax > 0 && (
                          <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 2 }}>
                            ({fmtNum(pax)})
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* Total row */}
            {totalRow && (
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td className="row-header" style={{ fontWeight: 700 }}>{t('row_total')}</td>
                <td style={{ fontWeight: 700 }}>{fmtNum(totalRow.total || 0)}</td>
                {airlines.map(al => {
                  const pax = totalRow[al] || 0
                  const share = (totalRow.total || 0) > 0 ? pax / totalRow.total * 100 : 0
                  return (
                    <td key={al} style={{
                      fontWeight: 700,
                      color: al === 'CA' ? CA_RED : '#374151',
                    }}>
                      {pax > 0 ? `${fmtPct(share, 0)} (${fmtNum(pax)})` : '–'}
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StackedBar({ title, items, nameKey, airlines, sort }) {
  if (!items || items.length === 0) return null
  const sorted = sortItems(items, sort, airlines, nameKey)
  if (sorted.length === 0) return null

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const total = params.reduce((s, p) => s + p.value, 0)
        return `<b>${params[0].axisValue}</b><br/>Total: ${fmtNum(total)}<br/>` +
          params.filter(p => p.value > 0).map(p =>
            `${p.marker} ${p.seriesName}: ${fmtPct(total > 0 ? p.value / total * 100 : 0)} (${fmtNum(p.value)})`
          ).join('<br/>')
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 20, bottom: 40, left: 200 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: sorted.map(i => (i[nameKey] || '').length > 25 ? i[nameKey].substring(0, 25) + '...' : i[nameKey]),
      inverse: true,
      axisLabel: { fontSize: 10 },
    },
    series: airlines.map(al => ({
      name: al,
      type: 'bar',
      stack: 'total',
      itemStyle: { color: getAirlineColor(al) },
      data: sorted.map(i => i[al] || 0),
    })),
  }

  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <div className="chart-title">{title}</div>
      <ReactECharts option={option} style={{ height: Math.max(200, sorted.length * 32) }} />
    </div>
  )
}

function WeeklyComparison({ title, data, nameKey, airlines, t }) {
  if (!data || data.length === 0) return null
  // data has both present and last week values: item.CA = present, item.CA_prev = last week
  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <div className="chart-title">{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="row-header">{t('col_name')}</th>
              {airlines.map(al => (
                <th key={al} colSpan={2} style={{
                  color: al === 'CA' ? CA_RED : undefined,
                  borderBottom: '2px solid #e5e7eb',
                }}>{al}</th>
              ))}
              <th colSpan={2} style={{ borderBottom: '2px solid #e5e7eb' }}>{t('row_total')}</th>
            </tr>
            <tr>
              <th></th>
              {airlines.map(al => (
                <React.Fragment key={al}>
                  <th style={{ fontSize: 10, color: '#9ca3af' }}>{t('this_week')}</th>
                  <th style={{ fontSize: 10, color: '#9ca3af' }}>{t('last_week')}</th>
                </React.Fragment>
              ))}
              <th style={{ fontSize: 10, color: '#9ca3af' }}>{t('this_week')}</th>
              <th style={{ fontSize: 10, color: '#9ca3af' }}>{t('last_week')}</th>
            </tr>
          </thead>
          <tbody>
            {data.filter(i => i[nameKey] !== 'Total' && i[nameKey] !== 'TOTAL')
              .sort((a, b) => (b.total_curr ?? 0) - (a.total_curr ?? 0))
              .map((item, i) => {
              // Support both field formats: {CA: v} or {CA_curr: v, CA_last: v}
              const getCurr = (al) => item[`${al}_curr`] ?? item[al] ?? 0
              const getLast = (al) => item[`${al}_last`] ?? item[`${al}_prev`] ?? 0
              const totalCurr = item.total_curr ?? airlines.reduce((s, al) => s + getCurr(al), 0)
              const totalLast = item.total_last ?? airlines.reduce((s, al) => s + getLast(al), 0)
              return (
              <tr key={i}>
                <td className="row-header" style={{ fontSize: 11 }}>
                  {(item[nameKey] || '').length > 25 ? item[nameKey].substring(0, 25) + '...' : item[nameKey]}
                </td>
                {airlines.map(al => (
                  <React.Fragment key={al}>
                    <td style={{ fontSize: 11, fontWeight: al === 'CA' ? 600 : 400 }}>
                      {getCurr(al)}
                    </td>
                    <td style={{ fontSize: 11, color: '#9ca3af' }}>
                      {getLast(al)}
                    </td>
                  </React.Fragment>
                ))}
                <td style={{ fontWeight: 600, fontSize: 11 }}>{totalCurr}</td>
                <td style={{ fontSize: 11, color: '#9ca3af' }}>{totalLast}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AirlineSummary({ title, data, t }) {
  if (!data || data.length === 0) return null

  // Auto-detect format: D+I/I+I/P2P vs YTD/Current/Past
  const hasTripType = data[0] && ('D+I' in data[0])
  const grandTotal = data.reduce((s, a) => s + (a.total || 0), 0)

  if (hasTripType) {
    return (
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">{title}</div>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="row-header">{t('col_airline')}</th>
              <th>D+I</th>
              <th>I+I</th>
              <th>P2P</th>
              <th>{t('col_total')}</th>
              <th>{t('col_share')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a, i) => (
              <tr key={i} style={{
                background: a.airline === 'CA' ? '#FFF5F5' : undefined,
                fontWeight: a.airline === 'CA' ? 600 : 400,
              }}>
                <td className="row-header" style={{
                  fontWeight: 700, color: a.airline === 'CA' ? CA_RED : undefined,
                }}>{a.airline}</td>
                <td>{fmtNum(a['D+I'] || 0)}</td>
                <td>{fmtNum(a['I+I'] || 0)}</td>
                <td>{fmtNum(a['P2P'] || 0)}</td>
                <td style={{ fontWeight: 700 }}>{fmtNum(a.total || 0)}</td>
                <td style={{ color: a.airline === 'CA' ? CA_RED : undefined }}>
                  {grandTotal > 0 ? fmtPct((a.total || 0) / grandTotal * 100) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // YTD / Current / Past format
  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <div className="chart-title">{title}</div>
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="row-header">{t('col_airline')}</th>
            <th>{t('col_ytd')}</th>
            <th>{t('col_ytd_share')}</th>
            <th>{t('col_this_week')}</th>
            <th>{t('col_this_week_share')}</th>
            <th>{t('col_last_week_2')}</th>
            <th>{t('col_last_week_share')}</th>
            <th>{t('col_share_change')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a, i) => (
            <tr key={i} style={{
              background: a.airline === 'CA' ? '#FFF5F5' : undefined,
              fontWeight: a.airline === 'CA' ? 600 : 400,
            }}>
              <td className="row-header" style={{
                fontWeight: 700, color: a.airline === 'CA' ? CA_RED : undefined,
              }}>{a.airline}</td>
              <td>{fmtNum(a.ytd || 0)}</td>
              <td>{fmtPct((a.ytd_share || 0) * 100)}</td>
              <td>{fmtNum(a.current || 0)}</td>
              <td>{fmtPct((a.current_share || 0) * 100)}</td>
              <td>{fmtNum(a.past || 0)}</td>
              <td>{fmtPct((a.past_share || 0) * 100)}</td>
              <td style={{
                color: (a.share_growth || 0) > 0 ? 'var(--green)' : 'var(--red)',
                fontWeight: 600,
              }}>
                {(a.share_growth || 0) > 0 ? '+' : ''}{fmtPct((a.share_growth || 0) * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Channel({ snapshot }) {
  const { t } = useLang()
  const [tab, setTab] = useState('ota')
  const [sort, setSort] = useState('total_desc')
  const [ota, setOta] = useState(null)
  const [consol, setConsol] = useState(null)
  const [tmc, setTmc] = useState(null)
  const [trip, setTrip] = useState(null)

  useEffect(() => {
    if (!snapshot) return
    getSheetData('ota', snapshot).then(setOta)
    getSheetData('consol', snapshot).then(setConsol)
    getSheetData('tmc', snapshot).then(setTmc)
    getSheetData('trip_com', snapshot).then(setTrip)
  }, [snapshot])

  const renderOTA = () => {
    if (!ota) return <div className="loading">Loading...</div>
    const als = ota.airlines || ['CA', 'MU', 'CZ', 'HU', 'ZH', 'HO']
    return (
      <>
        <ShareTable title={t("ota_share")} items={ota.present} nameKey="agent" airlines={als} sort={sort} setSort={setSort} t={t} />
        <StackedBar title={t("ota_pax")} items={ota.present} nameKey="agent" airlines={als} sort={sort} t={t} />
        {ota.weekly_comparison && (
          <WeeklyComparison title={t("weekly_compare")} data={ota.weekly_comparison} nameKey="agent" airlines={als.slice(0, 6)} t={t} />
        )}
        {/* OTA airline_summary not available as standalone table in Excel */}
      </>
    )
  }

  const renderConsol = () => {
    if (!consol) return <div className="loading">Loading...</div>
    // Detect airlines from present data or airline_summary
    const sampleRow = (consol.present || consol.share || [])[0] || {}
    const als = Object.keys(sampleRow).filter(k => k.length <= 3 && k === k.toUpperCase() && k !== 'total' && !['agent','tmc'].includes(k))
    if (als.length === 0) return <div className="loading">No data</div>
    return (
      <>
        <ShareTable title={t("consol_share")} items={consol.present} nameKey="agent" airlines={als} sort={sort} setSort={setSort} t={t} />
        <StackedBar title={t("consol_pax")} items={consol.present} nameKey="agent" airlines={als} sort={sort} t={t} />
        {consol.weekly_comparison && (
          <WeeklyComparison title={t("weekly_compare")} data={consol.weekly_comparison} nameKey="agent" airlines={als.slice(0, 6)} t={t} />
        )}
        {consol.airline_summary && (
          <AirlineSummary title={t("airline_summary")} data={consol.airline_summary} t={t} />
        )}
      </>
    )
  }

  const renderTMC = () => {
    if (!tmc) return <div className="loading">Loading...</div>
    const als = tmc.airlines || ['CA', 'BA', 'MU', 'CZ', 'HU', 'ZH', 'HO', 'GS']
    return (
      <>
        <ShareTable title={t("tmc_share")} items={tmc.present} nameKey="tmc" airlines={als} sort={sort} setSort={setSort} t={t} />
        <StackedBar title={t("tmc_pax")} items={tmc.present} nameKey="tmc" airlines={als} sort={sort} t={t} />
        {(tmc.weekly_comparison || tmc.weekly) && (
          <WeeklyComparison title={t("weekly_compare")} data={tmc.weekly_comparison || tmc.weekly} nameKey="tmc" airlines={als.slice(0, 6)} t={t} />
        )}
      </>
    )
  }

  const renderTrip = () => {
    if (!trip) return <div className="loading">Loading...</div>
    const als = trip.airlines || ['CA', 'MU', 'CZ', 'HU', 'HO', 'ZH', 'GS', 'JD', 'BA']
    const countries = (trip.countries || [])
    const total = countries.find(c => c.country === 'TOTAL')
    const nonTotal = countries.filter(c => c.country !== 'TOTAL')

    const barOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const tot = params.reduce((s, p) => s + p.value, 0)
          return `<b>${params[0].axisValue}</b><br/>Total: ${fmtNum(tot)}<br/>` +
            params.filter(p => p.value > 0).map(p =>
              `${p.marker} ${p.seriesName}: ${fmtPct(tot > 0 ? p.value / tot * 100 : 0)} (${fmtNum(p.value)})`
            ).join('<br/>')
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 10, right: 20, bottom: 40, left: 160 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: nonTotal.slice(0, 15).map(c => c.country),
        inverse: true,
        axisLabel: { fontSize: 10 },
      },
      series: als.map(al => ({
        name: al,
        type: 'bar',
        stack: 'total',
        itemStyle: { color: getAirlineColor(al) },
        data: nonTotal.slice(0, 15).map(c => c[al] || 0),
      })),
    }

    return (
      <>
        {total && (
          <div className="kpi-row" style={{ marginBottom: 20 }}>
            <div className="kpi-card highlight">
              <div className="kpi-label">Trip.com CA</div>
              <div className="kpi-value">{fmtPct(total.total > 0 ? (total.CA || 0) / total.total * 100 : 0)}</div>
              <div className="kpi-detail">{fmtNum(total.CA || 0)} / {fmtNum(total.total)} Pax</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{t('trip_china_origin')}</div>
              <div className="kpi-value">{fmtNum(nonTotal.find(c => c.country.includes('China'))?.total || 0)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{t('trip_uk_origin')}</div>
              <div className="kpi-value">{fmtNum(nonTotal.find(c => c.country === 'United Kingdom')?.total || 0)}</div>
            </div>
          </div>
        )}

        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div className="chart-title">{t('trip_by_country')}</div>
          <ReactECharts option={barOption} style={{ height: 450 }} />
        </div>

        <div className="chart-card">
          <div className="chart-title">
            {t('trip_country_share')}
            <SortButtons sort={sort} setSort={setSort} t={t} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="row-header">{t("col_country")}</th>
                  <th>{t('col_total')}</th>
                  {als.map(al => (
                    <th key={al} style={{ color: al === 'CA' ? CA_RED : undefined }}>{al}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...nonTotal].sort((a, b) => {
                  if (sort === 'ca_pct_desc') {
                    const aS = a.total > 0 ? (a.CA || 0) / a.total : 0
                    const bS = b.total > 0 ? (b.CA || 0) / b.total : 0
                    return bS - aS
                  }
                  if (sort === 'ca_pax_desc') return (b.CA || 0) - (a.CA || 0)
                  return (b.total || 0) - (a.total || 0)
                }).map(c => (
                  <tr key={c.country}>
                    <td className="row-header" style={{ fontSize: 11 }}>{c.country}</td>
                    <td style={{ fontWeight: 600 }}>{fmtNum(c.total)}</td>
                    {als.map(al => {
                      const share = c.total > 0 ? (c[al] || 0) / c.total * 100 : 0
                      return (
                        <td key={al} style={{
                          fontWeight: al === 'CA' ? 600 : 400,
                          color: al === 'CA' && share > 30 ? CA_RED : '#6b7280',
                          fontSize: 12,
                        }}>
                          {(c[al] || 0) > 0 ? fmtPct(share, 0) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("channel_title")}</h2>
        <div className="desc">{t("channel_desc")}</div>
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        borderBottom: '2px solid #e5e7eb', paddingBottom: 8,
      }}>
        {CHANNEL_TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSort('total_desc') }} style={{
            padding: '8px 20px', border: 'none', borderRadius: '6px 6px 0 0',
            background: tab === t.id ? CA_RED : '#f3f4f6',
            color: tab === t.id ? 'white' : '#6b7280',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ota' && renderOTA()}
      {tab === 'consol' && renderConsol()}
      {tab === 'tmc' && renderTMC()}
      {tab === 'trip' && renderTrip()}
    </div>
  )
}
