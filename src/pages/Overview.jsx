import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { getSheetData } from '../utils/db'
import { CA_RED, getAirlineColor, fmtPct, fmtNum } from '../utils/colors'
import { useLang } from '../utils/i18n'

export default function Overview({ snapshot }) {
  const { t } = useLang()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!snapshot) return
    getSheetData('month_share', snapshot).then(setData)
  }, [snapshot])

  if (!data) return <div className="loading">{t('loading')}</div>

  const { share, triptype, triptype_total, triptype_detail } = data
  const airlines = share.filter(s => s.airline !== 'TOTAL')
  const total = share.find(s => s.airline === 'TOTAL')
  const ca = share.find(s => s.airline === 'CA')

  const months = ['MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT']
  const monthsCurr = ['JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV']

  // ─── KPI Cards ───
  const caShareTTL = ca?.share_TTL || 0
  const caCurrTTL = ca?.curr_TTL || 0
  const caPrevTTL = ca?.prev_TTL || 0
  const caWoW = ca?.wow_pct || 0
  const mktWoW = total?.wow_pct || 0

  // ─── Monthly share line chart (ALL airlines) ───
  const monthLineOption = {
    tooltip: { trigger: 'axis', formatter: params =>
      params.map(p => `${p.marker} ${p.seriesName}: ${p.value}%`).join('<br/>')
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 20, bottom: 50, left: 50 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, min: 0 },
    series: airlines.map(a => ({
      name: a.airline,
      type: 'line',
      smooth: true,
      lineStyle: {
        width: a.airline === 'CA' ? 3 : 1.5,
        type: a.airline === 'CA' ? 'solid' : 'dashed',
      },
      itemStyle: { color: getAirlineColor(a.airline) },
      symbol: a.airline === 'CA' ? 'circle' : 'none',
      symbolSize: a.airline === 'CA' ? 6 : 0,
      data: months.map(m => +(a[`share_${m}`] * 100).toFixed(1)),
    })),
  }

  // ─── Current vs Previous week bar chart ───
  const compBarOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const al = params[0].axisValue
        const curr = params.find(p => p.seriesName === t('this_week'))?.value || 0
        const prev = params.find(p => p.seriesName === t('last_week'))?.value || 0
        const wow = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : '–'
        return `<b>${al}</b><br/>${t('this_week')}: ${fmtNum(curr)}<br/>${t('last_week')}: ${fmtNum(prev)}<br/>${t('col_wow')}: ${wow}%`
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 20, bottom: 40, left: 50 },
    xAxis: { type: 'category', data: airlines.map(a => a.airline) },
    yAxis: { type: 'value' },
    series: [
      {
        name: t('this_week'),
        type: 'bar',
        data: airlines.map(a => ({
          value: a.curr_TTL,
          itemStyle: { color: a.airline === 'CA' ? CA_RED : '#D1D5DB' },
        })),
      },
      {
        name: t('last_week'),
        type: 'bar',
        data: airlines.map(a => ({
          value: a.prev_TTL,
          itemStyle: { color: a.airline === 'CA' ? '#F9A8B8' : '#E5E7EB' },
        })),
      },
    ],
  }

  // ─── Trip Type: Market share table (bottom table) ───
  const detailAirlines = (triptype_detail || []).filter(t => t.airline !== 'TOTAL')
  const detailTotal = (triptype_detail || []).find(t => t.airline === 'TOTAL')

  // Trip type 100% stacked bar showing ALL airlines' market share
  const tripTypes = ['D+I', 'I+I', 'P2P']
  const stackOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        return params.filter(p => p.value > 0).map(p =>
          `${p.marker} ${p.seriesName}: ${p.value}%`
        ).join('<br/>')
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 20, bottom: 45, left: 50 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: tripTypes },
    series: detailAirlines.map(a => ({
      name: a.airline,
      type: 'bar',
      stack: 'total',
      barWidth: 28,
      itemStyle: { color: getAirlineColor(a.airline) },
      data: [
        +(a.mkt_DI * 100).toFixed(1),
        +(a.mkt_II * 100).toFixed(1),
        +(a.mkt_P2P * 100).toFixed(1),
      ],
    })),
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('overview_title')}</h2>
        <div className="desc">{t('overview_desc')} {snapshot}</div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <div className="kpi-card highlight">
          <div className="kpi-label">{t('kpi_ca_share')}</div>
          <div className="kpi-value">{fmtPct(caShareTTL * 100)}</div>
          <div className="kpi-detail">{fmtNum(caCurrTTL)} Pax ({t('this_week')})</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi_ca_wow')}</div>
          <div className="kpi-value" style={{ color: caWoW > 0 ? 'var(--green)' : 'var(--red)' }}>
            {caWoW > 0 ? '+' : ''}{fmtPct(caWoW * 100)}
          </div>
          <div className="kpi-detail">{fmtNum(caPrevTTL)} → {fmtNum(caCurrTTL)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi_market_wow')}</div>
          <div className="kpi-value" style={{ color: mktWoW > 0 ? 'var(--green)' : 'var(--red)' }}>
            {mktWoW > 0 ? '+' : ''}{fmtPct(mktWoW * 100)}
          </div>
          <div className="kpi-detail">{fmtNum(total?.prev_TTL || 0)} → {fmtNum(total?.curr_TTL || 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi_ca_prev_share')}</div>
          <div className="kpi-value">
            {fmtPct((ca?.prev_share || 0) * 100)}
          </div>
          <div className="kpi-detail">
            {((caShareTTL - (ca?.prev_share || 0)) * 100) > 0 ? '+' : ''}
            {((caShareTTL - (ca?.prev_share || 0)) * 100).toFixed(1)}pp {t('change_pp')}
          </div>
        </div>
      </div>

      {/* Monthly share trend - ALL airlines */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">{t('chart_monthly_share')}</div>
        <ReactECharts option={monthLineOption} style={{ height: 320 }} />
      </div>

      {/* Row 2: Current vs Previous + Trip Type */}
      <div className="chart-grid cols-2">
        <div className="chart-card">
          <div className="chart-title">
            {t('chart_wow_compare')}
            <span className="badge">{t('all_airlines')}</span>
          </div>
          <ReactECharts option={compBarOption} style={{ height: 300 }} />
        </div>
        <div className="chart-card">
          <div className="chart-title">
            {t('chart_triptype_share')}
            <span className="badge">{t('stacked_100')}</span>
          </div>
          <ReactECharts option={stackOption} style={{ height: 300 }} />
        </div>
      </div>

      {/* Monthly WoW detail table */}
      <div className="chart-card" style={{ marginTop: 20 }}>
        <div className="chart-title">{t('table_share_detail')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="row-header">{t('col_airline')}</th>
                <th>{t('col_total_share')}</th>
                {months.map(m => <th key={m}>{m}</th>)}
                <th>{t('col_this_week_pax')}</th>
                <th>{t('col_last_week_pax')}</th>
                <th>{t('col_wow')}</th>
              </tr>
            </thead>
            <tbody>
              {airlines.map(a => {
                const wow = a.wow_pct
                return (
                  <tr key={a.airline} style={{
                    background: a.airline === 'CA' ? '#FFF5F5' : undefined,
                    fontWeight: a.airline === 'CA' ? 600 : 400,
                  }}>
                    <td className="row-header" style={{
                      color: a.airline === 'CA' ? CA_RED : undefined,
                      fontWeight: 700,
                    }}>
                      {a.airline}
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmtPct(a.share_TTL * 100)}</td>
                    {months.map(m => (
                      <td key={m}>{fmtPct(a[`share_${m}`] * 100)}</td>
                    ))}
                    <td>{fmtNum(a.curr_TTL)}</td>
                    <td>{fmtNum(a.prev_TTL)}</td>
                    <td style={{
                      color: wow > 0 ? 'var(--green)' : wow < 0 ? 'var(--red)' : undefined,
                      fontWeight: 600,
                    }}>
                      {wow > 0 ? '+' : ''}{fmtPct(wow * 100)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trip type detail table */}
      <div className="chart-card" style={{ marginTop: 20 }}>
        <div className="chart-title">{t('table_triptype_detail')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="row-header">{t('col_airline')}</th>
                <th colSpan={4} style={{ background: '#f3f4f6' }}>{t('market_share_header')}</th>
                <th colSpan={3} style={{ background: '#f9fafb' }}>{t('airline_comp_header')}</th>
              </tr>
              <tr>
                <th className="row-header"></th>
                <th style={{ background: '#f3f4f6' }}>D+I</th>
                <th style={{ background: '#f3f4f6' }}>I+I</th>
                <th style={{ background: '#f3f4f6' }}>P2P</th>
                <th style={{ background: '#f3f4f6' }}>{t('col_total')}</th>
                <th>D+I</th>
                <th>I+I</th>
                <th>P2P</th>
              </tr>
            </thead>
            <tbody>
              {detailAirlines.map(a => (
                <tr key={a.airline} style={{
                  background: a.airline === 'CA' ? '#FFF5F5' : undefined,
                  fontWeight: a.airline === 'CA' ? 600 : 400,
                }}>
                  <td className="row-header" style={{
                    color: a.airline === 'CA' ? CA_RED : undefined,
                    fontWeight: 700,
                  }}>{a.airline}</td>
                  <td style={{ background: '#f9fafb' }}>{fmtPct(a.mkt_DI * 100)}</td>
                  <td style={{ background: '#f9fafb' }}>{fmtPct(a.mkt_II * 100)}</td>
                  <td style={{ background: '#f9fafb' }}>{fmtPct(a.mkt_P2P * 100)}</td>
                  <td style={{ background: '#f9fafb', fontWeight: 700 }}>{fmtPct(a.mkt_TTL * 100)}</td>
                  <td>{fmtPct(a.own_DI * 100)}</td>
                  <td>{fmtPct(a.own_II * 100)}</td>
                  <td>{fmtPct(a.own_P2P * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
