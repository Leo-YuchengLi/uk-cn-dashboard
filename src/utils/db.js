/**
 * Database query helpers for the dashboard.
 * All queries go through Electron IPC → better-sqlite3.
 * For dev mode without Electron, falls back to mock data.
 */

const isElectron = typeof window !== 'undefined' && window.api
const API_BASE = 'http://localhost:3456'

export async function query(sql, params = []) {
  if (isElectron) {
    const result = await window.api.query(sql, params)
    if (!result.ok) throw new Error(result.error)
    return result.data
  }
  // Dev fallback: local API server
  const res = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

export async function getSnapshots() {
  if (isElectron) {
    const result = await window.api.getSnapshots()
    if (!result.ok) throw new Error(result.error)
    return result.data
  }
  const res = await fetch(`${API_BASE}/api/snapshots`)
  return res.json()
}

// ─── Sheet data (from pivot tables) ───

export async function getSheetData(sheetName, snapshot) {
  if (isElectron) {
    const result = await window.api.query(
      'SELECT data_json FROM sheet_data WHERE sheet_name=? AND snapshot_date=?',
      [sheetName, snapshot]
    )
    if (!result.ok) throw new Error(result.error)
    if (result.data.length === 0) return null
    return JSON.parse(result.data[0].data_json)
  }
  const res = await fetch(`${API_BASE}/api/sheet/${sheetName}?snapshot=${snapshot}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

// ─── Prebuilt queries ───

export async function getOverviewKPIs(snapshot) {
  const [totals] = await query(`
    SELECT SUM(pax) as total_pax FROM fact_citypair WHERE snapshot_date = ?
  `, [snapshot])

  const airlines = await query(`
    SELECT airline, SUM(pax) as pax FROM fact_citypair
    WHERE snapshot_date = ? GROUP BY airline ORDER BY pax DESC
  `, [snapshot])

  const totalPax = totals?.total_pax || 0
  const caRow = airlines.find(a => a.airline === 'CA')
  const caShare = totalPax > 0 ? ((caRow?.pax || 0) / totalPax * 100) : 0
  const caRank = airlines.findIndex(a => a.airline === 'CA') + 1

  return { totalPax, caShare, caRank, airlines }
}

export async function getCityPairMatrix(snapshot) {
  const rows = await query(`
    SELECT citypair_key, origin_city, dest_city, airline, SUM(pax) as pax
    FROM fact_citypair WHERE snapshot_date = ?
    GROUP BY citypair_key, airline
    ORDER BY SUM(pax) DESC
  `, [snapshot])

  // Group by citypair
  const cpMap = {}
  for (const r of rows) {
    if (!cpMap[r.citypair_key]) {
      cpMap[r.citypair_key] = {
        key: r.citypair_key,
        origin: r.origin_city,
        dest: r.dest_city,
        airlines: {},
        total: 0,
      }
    }
    cpMap[r.citypair_key].airlines[r.airline] = (cpMap[r.citypair_key].airlines[r.airline] || 0) + r.pax
    cpMap[r.citypair_key].total += r.pax
  }

  // Sort by total pax
  const sorted = Object.values(cpMap).sort((a, b) => b.total - a.total)

  // Get all airlines sorted by total
  const airlineTotals = {}
  for (const cp of sorted) {
    for (const [al, pax] of Object.entries(cp.airlines)) {
      airlineTotals[al] = (airlineTotals[al] || 0) + pax
    }
  }
  const allAirlines = Object.entries(airlineTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([al]) => al)

  const grandTotal = sorted.reduce((s, cp) => s + cp.total, 0)

  return { cityPairs: sorted, airlines: allAirlines, grandTotal }
}

export async function getCityPairDrilldown(snapshot, citypairKey) {
  // Airport pairs within this city pair
  const airports = await query(`
    SELECT od, origin_apt, dest_apt, airline, SUM(pax) as pax
    FROM fact_airportpair
    WHERE snapshot_date = ? AND citypair_key = ?
    GROUP BY od, airline
    ORDER BY pax DESC
  `, [snapshot, citypairKey])

  // Channel breakdown
  const channels = await query(`
    SELECT channel, airline, SUM(pax) as pax
    FROM fact_citypair
    WHERE snapshot_date = ? AND citypair_key = ?
    GROUP BY channel, airline
  `, [snapshot, citypairKey])

  return { airports, channels }
}

export async function getChannelOverview(snapshot) {
  return await query(`
    SELECT channel, airline, SUM(pax) as pax
    FROM fact_channel WHERE snapshot_date = ?
    GROUP BY channel, airline
    ORDER BY pax DESC
  `, [snapshot])
}

export async function getChannelAgents(snapshot, channel) {
  return await query(`
    SELECT agency_no, agency_name, tmc_name, airline, SUM(pax) as pax
    FROM fact_channel
    WHERE snapshot_date = ? AND channel = ?
    GROUP BY agency_no, airline
    ORDER BY pax DESC
  `, [snapshot, channel])
}

export async function getAgentScatter(snapshot) {
  return await query(`
    SELECT agency_no, agency_name, channel, tmc_name, airline, SUM(pax) as pax
    FROM fact_agency WHERE snapshot_date = ?
    GROUP BY agency_no, airline
    ORDER BY pax DESC
  `, [snapshot])
}

export async function getTripTypeBreakdown(snapshot) {
  return await query(`
    SELECT trip_type, airline, SUM(pax) as pax
    FROM fact_citypair WHERE snapshot_date = ?
    GROUP BY trip_type, airline
  `, [snapshot])
}

export async function getMonthTrend(snapshot) {
  return await query(`
    SELECT trip_month, airline, SUM(pax) as pax
    FROM fact_month WHERE snapshot_date = ?
    GROUP BY trip_month, airline
    ORDER BY trip_month
  `, [snapshot])
}

export async function getWoWComparison(currentSnapshot, prevSnapshot) {
  if (!prevSnapshot) return null

  const [curr] = await query(`
    SELECT SUM(pax) as pax FROM fact_citypair WHERE snapshot_date = ?
  `, [currentSnapshot])
  const [prev] = await query(`
    SELECT SUM(pax) as pax FROM fact_citypair WHERE snapshot_date = ?
  `, [prevSnapshot])

  if (!curr || !prev || !prev.pax) return null
  return {
    current: curr.pax,
    previous: prev.pax,
    delta: ((curr.pax - prev.pax) / prev.pax * 100),
  }
}
