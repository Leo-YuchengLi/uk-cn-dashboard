import React, { createContext, useContext, useState } from 'react'

const LangContext = createContext()

const T = {
  // ─── App / Sidebar ───
  app_title: { zh: 'UK-CN 航线周报', en: 'UK-CN Route Weekly' },
  app_subtitle: { zh: '国航(CA)竞争情报看板', en: 'Air China (CA) Competitive Intelligence' },
  tab_overview: { zh: '市场总览', en: 'Market Overview' },
  tab_citypair: { zh: '城市对竞争力', en: 'Route Competition' },
  tab_channel: { zh: '渠道分层', en: 'Channel Analysis' },
  tab_agent: { zh: '代理人战场', en: 'Agent Battlefield' },
  tab_trend: { zh: '趋势与环比', en: 'Trends & WoW' },
  tab_rawdata: { zh: '原始数据', en: 'Raw Data' },
  tab_ai: { zh: 'AI 助手', en: 'AI Assistant' },
  btn_import: { zh: '+ 导入周报 Excel', en: '+ Import Weekly Excel' },
  btn_importing: { zh: '导入中...', en: 'Importing...' },
  current_snapshot: { zh: '当前快照', en: 'Current Snapshot' },
  no_data_title: { zh: '尚无数据', en: 'No Data Yet' },
  no_data_desc: { zh: '点击左下角「导入周报」加载 Excel 文件', en: 'Click "Import Weekly Excel" at the bottom left to load an Excel file' },
  loading: { zh: '加载中...', en: 'Loading...' },

  // ─── Overview ───
  overview_title: { zh: '市场总览', en: 'Market Overview' },
  overview_desc: { zh: 'Sheet: Month share - Pax · 快照', en: 'Sheet: Month share - Pax · Snapshot' },
  kpi_ca_share: { zh: 'CA 总份额', en: 'CA Total Share' },
  kpi_ca_wow: { zh: 'CA 周环比', en: 'CA WoW Change' },
  kpi_market_wow: { zh: '市场总量环比', en: 'Market WoW Change' },
  kpi_ca_prev_share: { zh: 'CA vs 上期份额', en: 'CA vs Last Period' },
  this_week: { zh: '本周', en: 'This Week' },
  last_week: { zh: '上周', en: 'Last Week' },
  change_pp: { zh: '变化', en: 'change' },
  chart_monthly_share: { zh: '各航司月度份额趋势', en: 'Airline Monthly Share Trend' },
  chart_wow_compare: { zh: '本周 vs 上周客运量', en: 'This Week vs Last Week Pax' },
  all_airlines: { zh: '所有航司', en: 'All Airlines' },
  chart_triptype_share: { zh: '航程类型市场份额', en: 'Trip Type Market Share' },
  stacked_100: { zh: '100% 堆叠', en: '100% Stacked' },
  table_share_detail: { zh: '各航司份额 × 月份 × 环比明细', en: 'Airline Share × Month × WoW Detail' },
  col_airline: { zh: '航司', en: 'Airline' },
  col_total_share: { zh: '总份额', en: 'Total Share' },
  col_this_week_pax: { zh: '本周 Pax', en: 'This Week Pax' },
  col_last_week_pax: { zh: '上周 Pax', en: 'Last Week Pax' },
  col_wow: { zh: '环比', en: 'WoW' },
  table_triptype_detail: { zh: '航程类型份额明细（市场占比 + 航司内构成）', en: 'Trip Type Share Detail (Market Share + Airline Composition)' },
  market_share_header: { zh: '市场占比 (在该航程类型中占%)', en: 'Market Share (% within trip type)' },
  airline_comp_header: { zh: '航司内构成 (该航司流量分布)', en: 'Airline Composition (traffic distribution)' },

  // ─── CityPair ───
  citypair_title: { zh: 'Top OD 竞争力', en: 'Top OD Competition' },
  citypair_desc: { zh: 'Sheet: TOP 30 OD - ALL · 仅英国出发(单向) · 所有航司对比', en: 'Sheet: TOP 30 OD - ALL · UK origin only (one-way) · All airlines' },
  tab_city: { zh: '城市对', en: 'City Pairs' },
  tab_airport: { zh: '机场对', en: 'Airport Pairs' },
  tab_country: { zh: '国家对', en: 'Country Pairs' },
  col_total: { zh: '总量', en: 'Total' },
  col_country: { zh: '国家', en: 'Country' },
  col_market_pct: { zh: '市场占比', en: 'Market %' },
  matrix_city: { zh: '城市对 × 航司份额矩阵', en: 'City Pair × Airline Share Matrix' },
  matrix_airport: { zh: '机场对 × 航司份额矩阵', en: 'Airport × Airline Share Matrix' },
  matrix_country: { zh: '国家对 × 航司份额矩阵', en: 'Country × Airline Share Matrix' },
  multi_airport_merged: { zh: '多机场合并', en: 'Multi-airport merged' },
  bar_city: { zh: '城市对客运量 · 航司构成', en: 'City Pair Pax · Airline Composition' },
  bar_airport: { zh: '机场对客运量 · 航司构成', en: 'Airport Pax · Airline Composition' },
  bar_country: { zh: '国家对客运量 · 航司构成', en: 'Country Pax · Airline Composition' },
  ca_col_heatmap: { zh: 'CA 列色阶标注', en: 'CA column color-coded' },

  // ─── Channel ───
  channel_title: { zh: '渠道分层', en: 'Channel Analysis' },
  channel_desc: { zh: 'OTA · CONSOL · TMC · Trip.com 各渠道航司份额对比', en: 'OTA · CONSOL · TMC · Trip.com airline share comparison by channel' },
  sort_total_desc: { zh: '按总量↓', en: 'By Total↓' },
  sort_ca_pct_desc: { zh: '按CA份额↓', en: 'By CA%↓' },
  sort_ca_pax_desc: { zh: '按CA量↓', en: 'By CA Pax↓' },
  col_name: { zh: '名称', en: 'Name' },
  row_total: { zh: '合计', en: 'Total' },
  weekly_compare: { zh: '周度对比 · 本周 vs 上周', en: 'Weekly Comparison · This vs Last' },
  airline_summary: { zh: '渠道 · 航司汇总', en: 'Channel · Airline Summary' },
  col_ytd: { zh: 'YTD', en: 'YTD' },
  col_ytd_share: { zh: 'YTD 份额', en: 'YTD Share' },
  col_this_week: { zh: '本周', en: 'This Week' },
  col_this_week_share: { zh: '本周份额', en: 'This Week Share' },
  col_last_week_2: { zh: '上周', en: 'Last Week' },
  col_last_week_share: { zh: '上周份额', en: 'Last Week Share' },
  col_share_change: { zh: '份额变化', en: 'Share Change' },
  trip_ca_total: { zh: 'Trip.com CA', en: 'Trip.com CA' },
  trip_total: { zh: 'Trip.com 总量', en: 'Trip.com Total' },
  trip_china_origin: { zh: '中国出发', en: 'China Origin' },
  trip_uk_origin: { zh: '英国出发', en: 'UK Origin' },
  trip_by_country: { zh: 'Trip.com 按出票国家 · 航司构成', en: 'Trip.com by Ticket Country · Airline Composition' },
  trip_country_share: { zh: 'Trip.com 各国 · 航司份额%', en: 'Trip.com by Country · Airline Share%' },
  ota_share: { zh: 'OTA 代理人 · 航司份额%', en: 'OTA Agent · Airline Share%' },
  ota_pax: { zh: 'OTA 代理人 · 客运量构成', en: 'OTA Agent · Pax Composition' },
  consol_share: { zh: 'CONSOL 整合商 · 航司份额%', en: 'CONSOL · Airline Share%' },
  consol_pax: { zh: 'CONSOL 整合商 · 客运量构成', en: 'CONSOL · Pax Composition' },
  tmc_share: { zh: 'TMC 差旅公司 · 航司份额%', en: 'TMC · Airline Share%' },
  tmc_pax: { zh: 'TMC 差旅公司 · 客运量构成', en: 'TMC · Pax Composition' },

  // ─── Agent ───
  agent_title: { zh: '代理人战场', en: 'Agent Battlefield' },
  agent_desc_prefix: { zh: 'Sheet: ALL AGTS · 按 CA 客运量排序 · 共', en: 'Sheet: ALL AGTS · Sorted by CA Pax · Total' },
  agent_desc_suffix: { zh: '个代理人', en: 'agents' },
  agent_bar_title: { zh: 'Top 30 代理人 · 航司份额构成', en: 'Top 30 Agents · Airline Share' },
  agent_table_title: { zh: '代理人 × 航司份额明细', en: 'Agent × Airline Share Detail' },
  sorted_by_total: { zh: '按总量排序', en: 'Sorted by total' },
  col_agent: { zh: '代理人', en: 'Agent' },

  // ─── Trend ───
  trend_title: { zh: '趋势与环比', en: 'Trends & WoW' },
  trend_desc: { zh: '本周 vs 上周对比 · 各航司周环比变化', en: 'This vs Last Week · Airline WoW Changes' },
  market_wow: { zh: '市场总量环比', en: 'Market WoW' },
  chart_market_month: { zh: '市场总量 · 本周 vs 上周 (按出行月)', en: 'Market Total · This vs Last Week (by travel month)' },
  chart_airline_wow: { zh: '各航司月度环比变化', en: 'Airline Monthly WoW Changes' },
  by_travel_month: { zh: '按出行月', en: 'By travel month' },
  wow_ranking: { zh: '各航司环比排名', en: 'Airline WoW Ranking' },
  col_share: { zh: '份额', en: 'Share' },
  col_total_wow: { zh: '总量环比', en: 'Total WoW' },

  // ─── RawData ───
  rawdata_title: { zh: '原始数据', en: 'Raw Data' },
  rawdata_desc: { zh: 'Excel 原始 Sheet 数据', en: 'Original Excel Sheet Data' },

  // ─── AI ───
  ai_title: { zh: 'AI 助手', en: 'AI Assistant' },
  ai_desc: { zh: '自然语言查询数据 · 支持对比分析与策略建议', en: 'Natural language data queries · Comparison analysis & strategy suggestions' },
  ai_setup_title: { zh: '配置 Gemini API Key', en: 'Configure Gemini API Key' },
  ai_setup_desc: { zh: '使用 Google AI Studio 的 API Key。模型', en: 'Use Google AI Studio API Key. Model' },
  ai_save: { zh: '保存并开始', en: 'Save & Start' },
  ai_change_key: { zh: '换 Key', en: 'Change Key' },
  ai_try_questions: { zh: '试试这些问题', en: 'Try these questions' },
  ai_placeholder: { zh: '输入问题，如：CA在哪些城市对份额最低？', en: 'Ask a question, e.g. Where does CA have the lowest share?' },
  ai_send: { zh: '发送', en: 'Send' },
  ai_thinking: { zh: '分析中...', en: 'Analyzing...' },
  ai_presets: {
    zh: [
      'CA 在伦敦→上海的份额是多少？和竞品对比怎么样？',
      '哪些大市场 CA 份额低于 20%？',
      'Trip.com 渠道里 CA 份额趋势如何？',
      'TMC 渠道里 CA 和 BA 的竞争情况？',
      '本周哪些航司增长最快？',
      'OTA 渠道 E-TRAVEL 的航司分布？',
    ],
    en: [
      'What is CA share on London→Shanghai? How does it compare to competitors?',
      'Which large markets have CA share below 20%?',
      'How is CA share trending in the Trip.com channel?',
      'CA vs BA competition in the TMC channel?',
      'Which airlines grew fastest this week?',
      'Airline distribution for E-TRAVEL in OTA channel?',
    ],
  },
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('dashboard_lang') || 'zh')

  const toggleLang = () => {
    const next = lang === 'zh' ? 'en' : 'zh'
    setLang(next)
    localStorage.setItem('dashboard_lang', next)
  }

  const t = (key) => {
    const entry = T[key]
    if (!entry) return key
    if (typeof entry === 'string') return entry
    return entry[lang] || entry.zh || key
  }

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
