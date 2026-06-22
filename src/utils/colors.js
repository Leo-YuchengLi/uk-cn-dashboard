// CA-centric color scheme
export const CA_RED = '#C41E3A'
export const CA_LIGHT = '#E8384F'

// Airline colors: CA prominent, others muted
export const AIRLINE_COLORS = {
  CA: '#C41E3A',
  MU: '#6B7280',
  CZ: '#9CA3AF',
  HU: '#D1D5DB',
  BA: '#4B5563',
  HO: '#B0B8C4',
  ZH: '#A0A8B4',
  JD: '#C8CED6',
  GS: '#D4D8DE',
  NZ: '#E0E4E8',
}

export function getAirlineColor(code) {
  return AIRLINE_COLORS[code] || '#E5E7EB'
}

// Share heatmap: red (bad for CA) → yellow → green (good for CA)
export function shareToColor(share) {
  if (share === 0) return '#FEE2E2'        // 0% = light red
  if (share < 10) return '#FECACA'
  if (share < 20) return '#FED7AA'
  if (share < 30) return '#FDE68A'
  if (share < 40) return '#FEF08A'
  if (share < 50) return '#D9F99D'
  if (share < 60) return '#BBF7D0'
  if (share < 70) return '#86EFAC'
  if (share < 80) return '#6EE7B7'
  if (share < 90) return '#34D399'
  return '#10B981'                          // 90%+ = solid green
}

// Text color for heatmap cells
export function shareToTextColor(share) {
  if (share < 20) return '#991B1B'
  if (share > 70) return '#064E3B'
  return '#374151'
}

export function deltaArrow(delta) {
  if (delta > 0.5) return '↑'
  if (delta < -0.5) return '↓'
  return '→'
}

export function deltaClass(delta) {
  if (delta > 0.5) return 'up'
  if (delta < -0.5) return 'down'
  return 'flat'
}

export function fmtPct(value, decimals = 1) {
  return `${value.toFixed(decimals)}%`
}

export function fmtNum(value) {
  return value.toLocaleString('en-US')
}
