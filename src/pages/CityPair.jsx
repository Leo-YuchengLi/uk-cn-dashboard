import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { getSheetData } from '../utils/db'
import { shareToColor, shareToTextColor, CA_RED, getAirlineColor, fmtPct, fmtNum } from '../utils/colors'
import { useLang } from '../utils/i18n'

function ShareMatrix({ items, nameKey, airlines, title, badge, t }) {
  const grandTotal = items.reduce((s, o) => s + (o.total || 0), 0)
  return (
    <div className="chart-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
      <div className="chart-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="row-header">{nameKey === 'od' ? 'OD' : nameKey === 'city_pair' ? t('tab_city') : t('tab_country')}</th>
            <th>{t('col_total')}</th>
            <th>{t('col_market_pct')}</th>
            {airlines.map(al => (
              <th key={al} style={{
                color: al === 'CA' ? CA_RED : undefined,
                fontWeight: al === 'CA' ? 800 : undefined,
                minWidth: 48,
              }}>{al}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const mktShare = grandTotal > 0 ? item.total / grandTotal * 100 : 0
            return (
              <tr key={i}>
                <td className="row-header" style={{
                  fontWeight: 600, fontSize: 12,
                  fontFamily: nameKey === 'od' ? 'monospace' : undefined,
                }}>
                  {item[nameKey]}
                  {item.airports && item.airports.length > 1 && (
                    <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>
                      ({item.airports.length} ODs)
                    </span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtNum(item.total)}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtPct(mktShare, 1)}</td>
                {airlines.map(al => {
                  const pax = item[al] || 0
                  const share = item.total > 0 ? pax / item.total * 100 : 0
                  const isCA = al === 'CA'
                  return (
                    <td key={al} style={{
                      background: isCA ? shareToColor(share) : undefined,
                      color: isCA ? shareToTextColor(share) : '#6b7280',
                      fontWeight: isCA ? 700 : 400,
                      fontSize: 12,
                    }} title={`${fmtNum(pax)} Pax`}>
                      {pax > 0 ? fmtPct(share, 0) : '–'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StackedBar({ items, nameKey, airlines, title, badge, t }) {
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const total = params.reduce((s, p) => s + p.value, 0)
        return `<b>${params[0].axisValue}</b><br/>Total: ${fmtNum(total)}<br/>` +
          params.filter(p => p.value > 0).map(p =>
            `${p.marker} ${p.seriesName}: ${fmtPct(total > 0 ? p.value / total * 100 : 0)} (${fmtNum(p.value)})`
          ).join('<br/>')
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 20, bottom: 40, left: nameKey === 'od' ? 80 : 140 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: items.map(o => o[nameKey]),
      inverse: true,
      axisLabel: { fontSize: 11 },
    },
    series: airlines.map(al => ({
      name: al,
      type: 'bar',
      stack: 'total',
      itemStyle: { color: getAirlineColor(al) },
      data: items.map(o => o[al] || 0),
    })),
  }

  return (
    <div className="chart-card" style={{ marginBottom: 20 }}>
      <div className="chart-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <ReactECharts option={option} style={{ height: Math.max(300, items.length * 26) }} />
    </div>
  )
}

export default function CityPair({ snapshot }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('city')

  useEffect(() => {
    if (!snapshot) return
    getSheetData('top30_od', snapshot).then(setData)
  }, [snapshot])

  const { t } = useLang()

  if (!data) return <div className="loading">{t('loading')}</div>

  const { all_airlines, all_ods, city_pairs, country_pairs } = data
  const airlines = all_airlines.filter(a => a !== 'Grand Total' && a !== 'NZ').slice(0, 9)

  const SUB_TABS = [
    { id: 'city', label: t('tab_city') },
    { id: 'airport', label: t('tab_airport') },
    { id: 'country', label: t('tab_country') },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>{t('citypair_title')}</h2>
        <div className="desc">{t('citypair_desc')}</div>
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        borderBottom: '2px solid #e5e7eb', paddingBottom: 8,
      }}>
        {SUB_TABS.map(st => (
          <button key={st.id} onClick={() => setTab(st.id)} style={{
            padding: '8px 20px', border: 'none', borderRadius: '6px 6px 0 0',
            background: tab === st.id ? CA_RED : '#f3f4f6',
            color: tab === st.id ? 'white' : '#6b7280',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            {st.label}
          </button>
        ))}
      </div>

      {tab === 'city' && city_pairs && (
        <>
          <ShareMatrix
            items={city_pairs}
            nameKey="city_pair"
            airlines={airlines}
            title={t('matrix_city')}
            badge={`${city_pairs.length} ${t('tab_city')} · ${t('multi_airport_merged')}`}
            t={t}
          />
          <StackedBar
            items={city_pairs}
            nameKey="city_pair"
            airlines={airlines}
            title={t('bar_city')}
            t={t}
          />
        </>
      )}

      {tab === 'airport' && (
        <>
          <ShareMatrix
            items={all_ods}
            nameKey="od"
            airlines={airlines}
            title={t('matrix_airport')}
            badge="Top 30 OD"
            t={t}
          />
          <StackedBar
            items={all_ods}
            nameKey="od"
            airlines={airlines}
            title={t('bar_airport')}
            t={t}
          />
        </>
      )}

      {tab === 'country' && country_pairs && (
        <>
          <ShareMatrix
            items={country_pairs}
            nameKey="country_pair"
            airlines={airlines}
            title={t('matrix_country')}
            badge={`${country_pairs.length} ${t('tab_country')}`}
            t={t}
          />
          <StackedBar
            items={country_pairs}
            nameKey="country_pair"
            airlines={airlines}
            title={t('bar_country')}
            t={t}
          />
        </>
      )}
    </div>
  )
}
