import React, { useState, useEffect, useRef } from 'react'
import { getSheetData, query } from '../utils/db'
import { CA_RED } from '../utils/colors'
import { useLang } from '../utils/i18n'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function getSystemPrompt(lang) {
  if (lang === 'en') {
    return `You are the UK-CN route weekly report AI assistant, specialized in analyzing UK-China air passenger market data.

Your knowledge base includes (from BSP ticketing data):
- Airline market share & monthly trends (CA/MU/CZ/HU/BA/HO/ZH/JD/GS)
- City pair / airport pair competitive landscape
- Channel breakdown (OTA/CONSOL/TMC/Trip.com)
- Agent passenger volume & airline distribution
- Week-over-week changes

Analysis principles:
1. Air China (CA) perspective as core, but present all airlines objectively
2. Percentages first, absolute numbers as supplement
3. Provide actionable insights, not just number recitation
4. Respond in English, use airline IATA codes

Use the provided tools to query the database when users ask about data.`
  }
  return `你是UK-CN航线周报智能助手，专门分析英国-中国航空客运市场数据。

你的知识库包含以下数据（来自BSP票务系统）：
- 航司份额与月度趋势（CA/MU/CZ/HU/BA/HO/ZH/JD/GS）
- 城市对/机场对竞争格局
- 渠道分层数据（OTA/CONSOL/TMC/Trip.com）
- 代理人客运量与航司分布
- 周环比变化

分析原则：
1. 以国航(CA)视角为核心，但要客观呈现所有航司数据
2. 百分比优先，绝对数辅助
3. 回答要有actionable insight，不要只复述数字
4. 用中文回答，航司代码用英文缩写

当用户问到数据时，使用提供的工具查询数据库。`
}

// Tool definitions for Gemini function calling
const TOOLS = [{
  function_declarations: [
    {
      name: 'query_airline_share',
      description: '查询各航司的市场份额、月度趋势、环比数据',
      parameters: {
        type: 'object',
        properties: {
          airline: { type: 'string', description: '航司代码，如CA/MU/CZ，留空查全部' },
        },
      },
    },
    {
      name: 'query_city_pairs',
      description: '查询城市对或机场对的航司份额数据',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，如London/Shanghai/Beijing，留空查全部' },
        },
      },
    },
    {
      name: 'query_channel',
      description: '查询渠道数据（OTA/CONSOL/TMC/Trip.com）',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'ota/consol/tmc/trip_com' },
        },
      },
    },
    {
      name: 'query_agents',
      description: '查询代理人/旅行社的航司份额数据',
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: '代理人名称关键词，留空查Top代理人' },
        },
      },
    },
    {
      name: 'web_search',
      description: '搜索外部航空市场信息、新闻、政策等',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  ],
}]

async function executeFunction(name, args, snapshot) {
  try {
    switch (name) {
      case 'query_airline_share': {
        const data = await getSheetData('month_share', snapshot)
        if (!data) return { error: 'No data' }
        const shares = data.share || []
        if (args.airline) {
          const al = shares.find(s => s.airline === args.airline.toUpperCase())
          return al || { error: `Airline ${args.airline} not found` }
        }
        return { shares, triptype_detail: data.triptype_detail }
      }
      case 'query_city_pairs': {
        const data = await getSheetData('top30_od', snapshot)
        if (!data) return { error: 'No data' }
        if (args.city) {
          const matches = (data.city_pairs || []).filter(c =>
            c.city_pair.toLowerCase().includes(args.city.toLowerCase())
          )
          return { city_pairs: matches, all_airlines: data.all_airlines }
        }
        return { city_pairs: (data.city_pairs || []).slice(0, 15), all_airlines: data.all_airlines }
      }
      case 'query_channel': {
        const ch = args.channel || 'ota'
        const data = await getSheetData(ch, snapshot)
        return data || { error: `Channel ${ch} not found` }
      }
      case 'query_agents': {
        const data = await getSheetData('all_agents', snapshot)
        if (!data) return { error: 'No data' }
        if (args.agent_name) {
          const matches = data.agents.filter(a =>
            a.agent.toLowerCase().includes(args.agent_name.toLowerCase())
          )
          return { agents: matches.slice(0, 20), airlines: data.airlines }
        }
        return { agents: data.agents.slice(0, 20), airlines: data.airlines }
      }
      case 'web_search': {
        return { note: 'Web search requires Gemini grounding - included in prompt context' }
      }
      default:
        return { error: `Unknown function: ${name}` }
    }
  } catch (e) {
    return { error: e.message }
  }
}

async function callGemini(apiKey, messages, snapshot, lang = 'zh') {
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))

  const body = {
    contents,
    system_instruction: { parts: [{ text: getSystemPrompt(lang) }] },
    tools: TOOLS,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  }

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  if (!candidate) throw new Error('No response from Gemini')

  // Check for function calls
  const parts = candidate.content?.parts || []
  const functionCall = parts.find(p => p.functionCall)

  if (functionCall) {
    const { name, args } = functionCall.functionCall
    const result = await executeFunction(name, args || {}, snapshot)

    // Call Gemini again with function result
    const newContents = [
      ...contents,
      { role: 'model', parts: [{ functionCall: { name, args } }] },
      { role: 'user', parts: [{ functionResponse: { name, response: { result: JSON.stringify(result).substring(0, 8000) } } }] },
    ]

    const res2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, contents: newContents }),
    })

    if (!res2.ok) throw new Error('Gemini follow-up error')
    const data2 = await res2.json()
    const text = data2.candidates?.[0]?.content?.parts?.[0]?.text
    return text || '(No response)'
  }

  const text = parts.find(p => p.text)?.text
  return text || '(No response)'
}

// Presets moved to i18n.jsx as 'ai_presets'

function renderMarkdown(text) {
  // Simple markdown → HTML
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
  return html
}

export default function AIChat({ snapshot }) {
  const { t, lang } = useLang()
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_key') || '')
  const [keyInput, setKeyInput] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const saveKey = () => {
    localStorage.setItem('gemini_key', keyInput)
    setApiKey(keyInput)
  }

  const sendMessage = async (text) => {
    if (!text.trim() || !apiKey || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const allMsgs = [...messages, userMsg]
      const reply = await callGemini(apiKey, allMsgs, snapshot, lang)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    }

    setLoading(false)
  }

  if (!apiKey) {
    return (
      <div>
        <div className="page-header">
          <h2>{t('ai_title')}</h2>
          <div className="desc">{t('ai_desc')}</div>
        </div>
        <div className="chart-card" style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: 40 }}>
          <h3 style={{ marginBottom: 16 }}>{t('ai_setup_title')}</h3>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            {t('ai_setup_desc')}: {GEMINI_MODEL}
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="AIzaSy..."
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 14, marginBottom: 12,
            }}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
          />
          <button onClick={saveKey} style={{
            width: '100%', padding: '10px', background: CA_RED, color: 'white',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {t('ai_save')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {t('ai_title')}
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: '#D1FAE5', color: '#065F46',
          }}>
            {GEMINI_MODEL}
          </span>
          <button onClick={() => { setApiKey(''); localStorage.removeItem('gemini_key') }} style={{
            fontSize: 11, padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 4,
            background: 'white', cursor: 'pointer', color: '#6b7280',
          }}>
            {t('ai_change_key')}
          </button>
        </h2>
        <div className="desc">{t('current_snapshot')} {snapshot} · {t('ai_desc')}</div>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 0 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <h3 style={{ color: '#374151', marginBottom: 20 }}>{t('ai_try_questions')}</h3>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              maxWidth: 600, margin: '0 auto',
            }}>
              {(t('ai_presets') || []).map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)} style={{
                  padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8,
                  background: 'white', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  color: '#374151', lineHeight: 1.4,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.target.style.borderColor = CA_RED}
                onMouseLeave={e => e.target.style.borderColor = '#e5e7eb'}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            padding: '0 16px',
          }}>
            <div style={{
              maxWidth: '75%',
              padding: '12px 16px',
              borderRadius: 12,
              background: m.role === 'user' ? CA_RED : 'white',
              color: m.role === 'user' ? 'white' : '#374151',
              border: m.role === 'user' ? 'none' : '1px solid #e5e7eb',
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              {m.role === 'user' ? m.content : (
                <div
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                  style={{ wordBreak: 'break-word' }}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ padding: '0 16px' }}>
            <div style={{
              display: 'inline-block', padding: '12px 16px', borderRadius: 12,
              background: 'white', border: '1px solid #e5e7eb', color: '#9ca3af',
            }}>
              {t('ai_thinking')}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #e5e7eb',
        background: 'white', display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder={t('ai_placeholder')}
          disabled={loading}
          style={{
            flex: 1, padding: '10px 14px', border: '1px solid #d1d5db',
            borderRadius: 8, fontSize: 14, outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px', background: CA_RED, color: 'white',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {t('ai_send')}
        </button>
      </div>
    </div>
  )
}
