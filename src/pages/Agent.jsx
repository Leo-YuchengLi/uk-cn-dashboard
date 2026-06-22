import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { getSheetData } from '../utils/db'
import { CA_RED, getAirlineColor, fmtPct, fmtNum } from '../utils/colors'
import { useLang } from '../utils/i18n'

export default function Agent({ snapshot }) {
  const { t } = useLang()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!snapshot) return
    getSheetData('all_agents', snapshot).then(setData)
  }, [snapshot])

  if (!data) return <div className="loading">{t('loading')}</div>

  const { airlines, agents } = data

  // Top 30 agents bar chart with all airlines
  const top30 = agents.slice(0, 30)
  const displayAirlines = airlines.slice(0, 9)

  const barOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const total = params.reduce((s, p) => s + p.value, 0)
        const lines = params.filter(p => p.value > 0).map(p =>
          `${p.marker} ${p.seriesName}: ${fmtPct(total > 0 ? p.value / total * 100 : 0)} (${fmtNum(p.value)})`
        )
        const agentIdx = params[0].dataIndex
        return `<b>${top30[agentIdx].agent}</b><br/>Total: ${fmtNum(total)}<br/>` + lines.join('<br/>')
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 20, bottom: 40, left: 280 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: top30.map(a => a.agent.length > 35 ? a.agent.substring(0, 35) + '...' : a.agent),
      inverse: true,
      axisLabel: { fontSize: 10, width: 260, overflow: 'truncate' },
    },
    series: displayAirlines.map(al => ({
      name: al,
      type: 'bar',
      stack: 'total',
      itemStyle: { color: getAirlineColor(al) },
      data: top30.map(a => a[al] || 0),
    })),
  }

  // Percentage table
  return (
    <div>
      <div className="page-header">
        <h2>{t('agent_title')}</h2>
        <div className="desc">{t('agent_desc_prefix')} {agents.length} {t('agent_desc_suffix')}</div>
      </div>

      {/* Stacked bar */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title">
          {t('agent_bar_title')}
          <span className="badge">{t('sorted_by_total')}</span>
        </div>
        <ReactECharts option={barOption} style={{ height: Math.max(400, top30.length * 28) }} />
      </div>

      {/* Detail table with percentages */}
      <div className="chart-card">
        <div className="chart-title">{t('agent_table_title')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="row-header" style={{ minWidth: 240 }}>{t('col_agent')}</th>
                <th>{t('col_total')}</th>
                {displayAirlines.map(al => (
                  <th key={al} style={{
                    color: al === 'CA' ? CA_RED : undefined,
                    fontWeight: al === 'CA' ? 800 : undefined,
                  }}>{al}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={i}>
                  <td className="row-header" style={{ fontSize: 11 }}>
                    {a.agent.length > 40 ? a.agent.substring(0, 40) + '...' : a.agent}
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmtNum(a.total)}</td>
                  {displayAirlines.map(al => {
                    const pax = a[al] || 0
                    const share = a.total > 0 ? pax / a.total * 100 : 0
                    const isCA = al === 'CA'
                    return (
                      <td key={al} style={{
                        color: isCA && share > 30 ? CA_RED : undefined,
                        fontWeight: isCA ? 600 : 400,
                        fontSize: 12,
                      }} title={`${fmtNum(pax)} Pax`}>
                        {pax > 0 ? fmtPct(share, 0) : '–'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
