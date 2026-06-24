import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { getSheetData } from '../utils/db'
import { CA_RED, getAirlineColor, fmtPct, fmtNum } from '../utils/colors'
import { useLang } from '../utils/i18n'

export default function Trend({ snapshot }) {
  const { t } = useLang()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!snapshot) return
    getSheetData('month_share', snapshot).then(setData)
  }, [snapshot])

  if (!data) return <div className="loading">{t('loading')}</div>

  const { share = [] } = data
  const airlines = share.filter(s => s.airline !== 'TOTAL')
  const total = share.find(s => s.airline === 'TOTAL')
  const sampleAirline = share[0] || {}
  const monthsCurr = Object.keys(sampleAirline).filter(k => k.startsWith('curr_') && k !== 'curr_TTL').map(k => k.replace('curr_', ''))

  // Monthly WoW bar chart for each airline
  const wowBarOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => params
        .filter(p => p.value !== 0)
        .map(p => `${p.marker} ${p.seriesName}: ${p.value > 0 ? '+' : ''}${p.value}%`)
        .join('<br/>'),
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 20, right: 20, bottom: 45, left: 50 },
    xAxis: { type: 'category', data: monthsCurr },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: airlines.filter(a => ['CA', 'MU', 'CZ', 'HU', 'BA'].includes(a.airline)).map(a => ({
      name: a.airline,
      type: 'bar',
      itemStyle: { color: getAirlineColor(a.airline) },
      data: monthsCurr.map(m => {
        const val = a[`wow_${m}`]
        return val != null ? +(val * 100).toFixed(1) : 0
      }),
    })),
  }

  // Current vs Previous stacked comparison
  const compOption = {
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        const al = params[0].axisValue
        const curr = params.find(p => p.seriesName === t('this_week'))?.value || 0
        const prev = params.find(p => p.seriesName === t('last_week'))?.value || 0
        const wow = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : '–'
        return `<b>${al}</b><br/>${t('this_week')}: ${fmtNum(curr)}<br/>${t('last_week')}: ${fmtNum(prev)}<br/>${t('col_wow')}: ${wow}%`
      },
    },
    legend: { bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 60 },
    xAxis: { type: 'category', data: monthsCurr },
    yAxis: { type: 'value' },
    series: [
      {
        name: t('this_week'),
        type: 'bar',
        itemStyle: { color: CA_RED },
        data: monthsCurr.map(m => total?.[`curr_${m}`] || 0),
      },
      {
        name: t('last_week'),
        type: 'bar',
        itemStyle: { color: '#E5E7EB' },
        data: monthsCurr.map(m => total?.[`prev_${m}`] || 0),
      },
    ],
  }

  // Sort airlines by WoW change
  const sortedByWow = [...airlines].sort((a, b) => (b.wow_pct || 0) - (a.wow_pct || 0))

  return (
    <div>
      <div className="page-header">
        <h2>{t('trend_title')}</h2>
        <div className="desc">{t('trend_desc')}</div>
      </div>

      {/* WoW KPIs */}
      <div className="kpi-row">
        <div className="kpi-card highlight">
          <div className="kpi-label">{t('market_wow')}</div>
          <div className="kpi-value" style={{ color: (total?.wow_pct || 0) > 0 ? 'var(--green)' : 'var(--red)' }}>
            {(total?.wow_pct || 0) > 0 ? '+' : ''}{fmtPct((total?.wow_pct || 0) * 100)}
          </div>
        </div>
        {sortedByWow.slice(0, 3).map(a => (
          <div key={a.airline} className="kpi-card">
            <div className="kpi-label">{a.airline} {t('col_wow')}</div>
            <div className="kpi-value" style={{
              color: (a.wow_pct || 0) > 0 ? 'var(--green)' : 'var(--red)',
              fontSize: 22,
            }}>
              {(a.wow_pct || 0) > 0 ? '+' : ''}{fmtPct((a.wow_pct || 0) * 100)}
            </div>
            <div className="kpi-detail">{fmtNum(a.prev_TTL)} → {fmtNum(a.curr_TTL)}</div>
          </div>
        ))}
      </div>

      {/* Market total by month */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">{t('chart_market_month')}</div>
        <ReactECharts option={compOption} style={{ height: 280 }} />
      </div>

      {/* Monthly WoW by airline */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">
          {t('chart_airline_wow')}
          <span className="badge">{t('by_travel_month')}</span>
        </div>
        <ReactECharts option={wowBarOption} style={{ height: 300 }} />
      </div>

      {/* WoW ranking table */}
      <div className="chart-card">
        <div className="chart-title">{t('wow_ranking')}</div>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="row-header">{t('col_airline')}</th>
              <th>{t('col_share')}</th>
              <th>{t('col_last_week_pax')}</th>
              <th>{t('col_this_week_pax')}</th>
              <th>{t('col_total_wow')}</th>
              {monthsCurr.map(m => <th key={m}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {sortedByWow.map(a => (
              <tr key={a.airline} style={{
                background: a.airline === 'CA' ? '#FFF5F5' : undefined,
              }}>
                <td className="row-header" style={{
                  fontWeight: 700,
                  color: a.airline === 'CA' ? CA_RED : undefined,
                }}>{a.airline}</td>
                <td>{fmtPct(a.share_TTL * 100)}</td>
                <td>{fmtNum(a.prev_TTL)}</td>
                <td style={{ fontWeight: 600 }}>{fmtNum(a.curr_TTL)}</td>
                <td style={{
                  fontWeight: 700,
                  color: (a.wow_pct || 0) > 0 ? 'var(--green)' : 'var(--red)',
                }}>
                  {(a.wow_pct || 0) > 0 ? '+' : ''}{fmtPct((a.wow_pct || 0) * 100)}
                </td>
                {monthsCurr.map(m => {
                  const val = a[`wow_${m}`]
                  return (
                    <td key={m} style={{
                      fontSize: 11,
                      color: val != null && val > 0 ? 'var(--green)' : val != null && val < 0 ? 'var(--red)' : '#9ca3af',
                    }}>
                      {val != null ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(0)}%` : '–'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
