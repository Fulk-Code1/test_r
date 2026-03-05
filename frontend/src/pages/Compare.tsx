import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar'

const API = import.meta.env.VITE_API_URL || '/api'
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316']

// ─── Excel helpers ────────────────────────────────────────────────
function xlsxDownload(rows: Record<string, any>[], filename: string, sheetName = 'Данные') {
  if (!rows?.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0]).map(k => ({
    wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function xlsxDownloadMulti(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    if (!rows?.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map(k => ({
      wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2
    }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function DownloadBtn({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title || 'Скачать Excel'}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-green-700 text-gray-400 hover:text-white transition text-xs">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
      </svg>
      .xlsx
    </button>
  )
}

// ─── fmt helpers ──────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n/1_000).toFixed(0)}K`
  return n.toFixed(0)
}
function pct(a: number, b: number) {
  if (b === 0) return '—'
  const diff = ((a - b) / Math.abs(b)) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
}
function pctColor(a: number, b: number) {
  if (b === 0) return 'text-gray-400'
  return a >= b ? 'text-green-400' : 'text-red-400'
}

const METRICS = [
  { key: 'revenue',     label: 'Выручка',       format: (v: number) => `${fmt(v)} MDL` },
  { key: 'grossProfit', label: 'Вал. прибыль',  format: (v: number) => `${fmt(v)} MDL` },
  { key: 'quantity',    label: 'Кол-во продаж', format: (v: number) => fmt(v) },
  { key: 'checks',      label: 'Кол-во чеков',  format: (v: number) => fmt(v) },
  { key: 'margin',      label: 'Маржа',         format: (v: number) => `${v.toFixed(1)}%` },
  { key: 'avgCheck',    label: 'Ср. чек',       format: (v: number) => `${fmt(v)} MDL` },
]

type ChartType = 'bar' | 'line' | 'bar-horizontal'

interface ChartConfig {
  id: string
  metrics: string[]
  chartType: ChartType
  showLabels: boolean
  showDots: boolean
  normalize: boolean
}

function buildChartData(flatResults: any[], metrics: string[]) {
  return flatResults.map(r => {
    const obj: any = { key: r.key }
    metrics.forEach(m => { obj[m] = r[m] ?? 0 })
    return obj
  })
}

function buildStoreMonthChartData(storeMonthData: any, metrics: string[]) {
  return storeMonthData.rows.map((row: any) => {
    const obj: any = { key: row.period }
    storeMonthData.stores.forEach((s: string) => {
      const cell = row[s] || { revenue: 0, grossProfit: 0, quantity: 0, checks: 0 }
      metrics.forEach(m => {
        let val = 0
        if (m === 'margin') val = cell.revenue > 0 ? (cell.grossProfit / cell.revenue) * 100 : 0
        else if (m === 'avgCheck') val = cell.checks > 0 ? cell.revenue / cell.checks : 0
        else val = cell[m] ?? 0
        obj[`${s}__${m}`] = val
      })
    })
    return obj
  })
}

// ─── ChartBlock ───────────────────────────────────────────────────
function ChartBlock({
  config, flatResults, storeMonthData, isStoreMonthMode, onRemove, onUpdate, chartIndex
}: {
  config: ChartConfig; flatResults: any[]; storeMonthData: any
  isStoreMonthMode: boolean; onRemove: () => void
  onUpdate: (cfg: ChartConfig) => void; chartIndex: number
}) {
  const showLabels = config.showLabels ?? false
  const showDots   = config.showDots   ?? false
  const normalize  = config.normalize  ?? false

  const normalizeData = (data: any[], keys: string[]) => {
    if (!normalize) return data
    return data.map(row => {
      const obj: any = { ...row }
      keys.forEach(k => {
        const vals = data.map(r => r[k] ?? 0)
        const max = Math.max(...vals)
        obj[`__norm_${k}`] = max > 0 ? ((row[k] ?? 0) / max) * 100 : 0
        obj[`__real_${k}`] = row[k] ?? 0
      })
      return obj
    })
  }

  const normKey = (k: string) => normalize ? `__norm_${k}` : k

  const buildTooltip = () => ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ color: '#fff', fontSize: 12, marginBottom: 6 }}>{label}</p>
        {payload.map((entry: any) => {
          const rawKey = entry.dataKey?.replace('__norm_', '')
          const realVal = normalize ? entry.payload[`__real_${rawKey}`] : entry.value
          const met = METRICS.find(x => x.key === rawKey)
          return (
            <p key={entry.dataKey} style={{ color: entry.color, fontSize: 12, margin: '2px 0' }}>
              {entry.name}: <strong>{met ? met.format(realVal ?? 0) : fmt(realVal ?? 0)}</strong>
              {normalize && <span style={{ color: '#6b7280', fontSize: 11 }}> ({Number(entry.value).toFixed(0)}%)</span>}
            </p>
          )
        })}
      </div>
    )
  }

  const handleDownload = () => {
    const metricLabels = config.metrics.map(k => METRICS.find(m => m.key === k)?.label || k).join('+')
    const filename = `Сравнение_График${chartIndex + 1}_${metricLabels}`

    if (isStoreMonthMode && storeMonthData) {
      const data = buildStoreMonthChartData(storeMonthData, config.metrics)
      const rows = data.map((r: any) => {
        const obj: any = { Период: r.key }
        storeMonthData.stores.forEach((s: string) => {
          config.metrics.forEach((m: string) => {
            const met = METRICS.find(x => x.key === m)
            obj[`${s} — ${met?.label || m}`] = r[`${s}__${m}`] ?? 0
          })
        })
        return obj
      })
      xlsxDownload(rows, filename, `График ${chartIndex + 1}`)
    } else {
      const data = buildChartData(flatResults, config.metrics)
      const rows = data.map((r: any) => {
        const obj: any = { Ключ: r.key }
        config.metrics.forEach(m => {
          const met = METRICS.find(x => x.key === m)
          obj[met?.label || m] = r[m] ?? 0
        })
        return obj
      })
      xlsxDownload(rows, filename, `График ${chartIndex + 1}`)
    }
  }

  const renderChart = () => {
    if (isStoreMonthMode && storeMonthData) {
      const rawData = buildStoreMonthChartData(storeMonthData, config.metrics)
      const keys: string[] = []
      storeMonthData.stores.forEach((s: string) => {
        config.metrics.forEach((m: string) => keys.push(`${s}__${m}`))
      })
      const data = normalizeData(rawData, keys)
      const yFmt = normalize ? (v: any) => `${Number(v).toFixed(0)}%` : (v: any) => fmt(v)

      if (config.chartType === 'line') return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
            <Tooltip content={buildTooltip()} />
            <Legend />
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={normKey(k)}
                name={k.replace('__', ' — ')}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={showDots ? { stroke: COLORS[i % COLORS.length], strokeWidth: 2, r: 4 } : false}
                label={showLabels ? { position: 'top', fontSize: 11, fill: COLORS[i % COLORS.length], formatter: (v: any) => fmt(v) } : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )
      if (config.chartType === 'bar-horizontal') return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
            <YAxis type="category" dataKey="key" stroke="#9ca3af" tick={{ fontSize: 10 }} width={80} />
            <Tooltip content={buildTooltip()} />
            <Legend />
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={normKey(k)}
                name={k.replace('__', ' — ')}
                fill={COLORS[i % COLORS.length]}
                radius={[0,4,4,0]}
              >
                {showLabels && <LabelList dataKey={normKey(k)} position="right" formatter={(v: any) => fmt(v)} style={{ fontSize: 11, fill: COLORS[i % COLORS.length] }} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
            <Tooltip content={buildTooltip()} />
            <Legend />
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={normKey(k)}
                name={k.replace('__', ' — ')}
                fill={COLORS[i % COLORS.length]}
                radius={[4,4,0,0]}
              >
                {showLabels && <LabelList dataKey={normKey(k)} position="top" formatter={(v: any) => fmt(v)} style={{ fontSize: 11, fill: COLORS[i % COLORS.length] }} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    // Обычный режим (не store-month)
    const rawData = buildChartData(flatResults, config.metrics)
    const data = normalizeData(rawData, config.metrics)
    const yFmt = normalize ? (v: any) => `${Number(v).toFixed(0)}%` : (v: any) => fmt(v)

    if (config.chartType === 'line') return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
          <Tooltip content={buildTooltip()} />
          <Legend />
          {config.metrics.map((m, i) => {
            const met = METRICS.find(x => x.key === m)
            return (
              <Line
                key={m}
                type="monotone"
                dataKey={normKey(m)}
                name={met?.label || m}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={showDots ? { stroke: COLORS[i % COLORS.length], strokeWidth: 2, r: 4 } : false}
                label={showLabels ? { position: 'top', fontSize: 11, fill: COLORS[i % COLORS.length], formatter: (v: any) => fmt(v) } : false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    )
    if (config.chartType === 'bar-horizontal') return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
          <YAxis type="category" dataKey="key" stroke="#9ca3af" tick={{ fontSize: 10 }} width={80} />
          <Tooltip content={buildTooltip()} />
          <Legend />
          {config.metrics.map((m, i) => {
            const met = METRICS.find(x => x.key === m)
            return (
              <Bar
                key={m}
                dataKey={normKey(m)}
                name={met?.label || m}
                fill={COLORS[i % COLORS.length]}
                radius={[0,4,4,0]}
              >
                {showLabels && <LabelList dataKey={normKey(m)} position="right" formatter={(v: any) => fmt(v)} style={{ fontSize: 11, fill: COLORS[i % COLORS.length] }} />}
              </Bar>
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    )
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
          <Tooltip content={buildTooltip()} />
          <Legend />
          {config.metrics.map((m, i) => {
            const met = METRICS.find(x => x.key === m)
            return (
              <Bar
                key={m}
                dataKey={normKey(m)}
                name={met?.label || m}
                fill={COLORS[i % COLORS.length]}
                radius={[4,4,0,0]}
              >
                {showLabels && <LabelList dataKey={normKey(m)} position="top" formatter={(v: any) => fmt(v)} style={{ fontSize: 11, fill: COLORS[i % COLORS.length] }} />}
              </Bar>
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {(['bar','line','bar-horizontal'] as ChartType[]).map(t => (
            <button key={t} onClick={() => onUpdate({ ...config, chartType: t })}
              className={`px-3 py-1 rounded text-xs font-medium transition ${config.chartType === t ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {t === 'bar' ? 'Bar' : t === 'line' ? 'Line' : 'Horizontal'}
            </button>
          ))}
          <span className="text-gray-600 text-xs mx-1">|</span>
          {METRICS.map(m => (
            <button key={m.key}
              onClick={() => {
                const has = config.metrics.includes(m.key)
                const next = has ? config.metrics.filter(x => x !== m.key) : [...config.metrics, m.key]
                if (next.length > 0) onUpdate({ ...config, metrics: next })
              }}
              className={`px-2 py-1 rounded text-xs transition ${config.metrics.includes(m.key) ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => onUpdate({ ...config, showLabels: !showLabels })} className="accent-blue-500 w-3.5 h-3.5" />
            Значения
          </label>
          {config.chartType === 'line' && (
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={showDots} onChange={() => onUpdate({ ...config, showDots: !showDots })} className="accent-blue-500 w-3.5 h-3.5" />
              Точки
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: normalize ? '#f59e0b' : '#9ca3af' }}>
            <input type="checkbox" checked={normalize} onChange={() => onUpdate({ ...config, normalize: !normalize })} className="accent-amber-500 w-3.5 h-3.5" />
            Нормализация
          </label>
          <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-sm transition">✕ Удалить</button>
        </div>
      </div>
      {renderChart()}
      <div className="flex justify-end mt-3">
        <DownloadBtn onClick={handleDownload} title={`Скачать данные графика ${chartIndex + 1}`} />
      </div>
    </div>
  )
}

// ─── Compare ──────────────────────────────────────────────────────
export default function Compare() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login' }

  const [allStores, setAllStores] = useState<string[]>([])
  const [allYears, setAllYears] = useState<number[]>([])
  const [mode, setMode] = useState<'store' | 'month' | 'year' | 'store-month'>('store')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['revenue', 'grossProfit', 'margin', 'avgCheck'])
  const [results, setResults] = useState<any>([])
  const [loading, setLoading] = useState(false)
  const [charts, setCharts] = useState<ChartConfig[]>([])

  useEffect(() => {
    axios.get(`${API}/compare/stores`).then(r => setAllStores(r.data))
    axios.get(`${API}/sales/years`).then(r => setAllYears(r.data))
  }, [])

  const toggleItem = (arr: any[], setArr: any, val: any) => {
    setArr(arr.includes(val) ? arr.filter((x: any) => x !== val) : [...arr, val])
  }

  const runCompare = async () => {
    setLoading(true)
    try {
      const params: any = { mode }
      if (selectedStores.length > 0) params.stores = selectedStores.join(',')
      if (selectedMonths.length > 0) params.months = selectedMonths.join(',')
      if (selectedYears.length > 0)  params.years  = selectedYears.join(',')
      const res = await axios.get(`${API}/compare`, { params })
      setResults(res.data)
      setCharts([])
      setBaseIndex(0)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const isStoreMonthMode = !Array.isArray(results) && results?.mode === 'store-month'
  const storeMonthData   = isStoreMonthMode ? results : null
  const rawFlatResults   = isStoreMonthMode ? [] : (Array.isArray(results) ? results : [])
  const [baseIndex, setBaseIndex] = useState(0)
  const flatResults      = baseIndex === 0 ? rawFlatResults : [...rawFlatResults].reverse()
  const baseItem         = flatResults[0] ?? null
  const hasResults       = flatResults.length > 0 || !!storeMonthData

  const modeLabel = { store: 'По_магазинам', month: 'По_месяцам', year: 'По_годам', 'store-month': 'Магазин_по_месяцам' }[mode]
  const baseFilename = `Сравнение_${modeLabel}`

  const downloadTable = () => {
    if (isStoreMonthMode && storeMonthData) {
      const sheets = METRICS.filter(m => selectedMetrics.includes(m.key)).map(metric => ({
        name: metric.label,
        rows: storeMonthData.rows.map((row: any) => {
          const obj: any = { Период: row.period }
          storeMonthData.stores.forEach((s: string) => {
            const cell = row[s] || { revenue: 0, grossProfit: 0, quantity: 0, checks: 0 }
            let val = 0
            if (metric.key === 'margin') val = cell.revenue > 0 ? parseFloat(((cell.grossProfit / cell.revenue) * 100).toFixed(2)) : 0
            else if (metric.key === 'avgCheck') val = cell.checks > 0 ? Math.round(cell.revenue / cell.checks) : 0
            else val = cell[metric.key] ?? 0
            obj[s] = val
          })
          return obj
        })
      }))
      xlsxDownloadMulti(sheets, baseFilename)
    } else {
      const rows = METRICS.filter(m => selectedMetrics.includes(m.key)).map(metric => {
        const obj: any = { Показатель: metric.label }
        flatResults.forEach((r: any) => { obj[r.key] = r[metric.key] ?? 0 })
        return obj
      })
      xlsxDownload(rows, baseFilename, 'Сравнение')
    }
  }

  const downloadAllCharts = () => {
    if (charts.length === 0) return
    const sheets = charts.map((cfg, idx) => {
      const metricLabels = cfg.metrics.map(k => METRICS.find(m => m.key === k)?.label || k).join(', ')
      if (isStoreMonthMode && storeMonthData) {
        const data = buildStoreMonthChartData(storeMonthData, cfg.metrics)
        return {
          name: `График ${idx + 1}`,
          rows: data.map((r: any) => {
            const obj: any = { Период: r.key }
            storeMonthData.stores.forEach((s: string) => {
              cfg.metrics.forEach((m: string) => {
                const met = METRICS.find(x => x.key === m)
                obj[`${s} — ${met?.label || m}`] = r[`${s}__${m}`] ?? 0
              })
            })
            return obj
          })
        }
      } else {
        const data = buildChartData(flatResults, cfg.metrics)
        return {
          name: `График ${idx + 1} (${metricLabels})`.slice(0, 31),
          rows: data.map((r: any) => {
            const obj: any = { Ключ: r.key }
            cfg.metrics.forEach(m => {
              const met = METRICS.find(x => x.key === m)
              obj[met?.label || m] = r[m] ?? 0
            })
            return obj
          })
        }
      }
    })
    xlsxDownloadMulti(sheets, `${baseFilename}_Графики`)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="compare" userRole={user?.role} rightSlot={
        <>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">Выйти</button>
        </>
      } />

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        <h2 className="text-xl font-bold">Сравнение</h2>

        {/* Фильтры */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Режим сравнения</h3>
            <div className="space-y-2">
              {[
                { val: 'store',       label: 'По магазинам' },
                { val: 'month',       label: 'По месяцам' },
                { val: 'year',        label: 'По годам' },
                { val: 'store-month', label: 'Магазин по месяцам' },
              ].map(m => (
                <button key={m.val} onClick={() => setMode(m.val as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${mode === m.val ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Магазины</h3>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {allStores.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300 py-0.5">
                  <input type="checkbox" checked={selectedStores.includes(s)} onChange={() => toggleItem(selectedStores, setSelectedStores, s)} className="accent-blue-500" />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className={`text-sm font-semibold mb-3 ${mode === 'year' ? 'text-gray-600' : 'text-gray-300'}`}>
              Месяцы {mode === 'year' && <span className="text-xs font-normal">(недоступно в режиме «По годам»)</span>}
            </h3>
            <div className="grid grid-cols-3 gap-1 mb-4">
              {MONTHS.map((m, i) => (
                <button key={i}
                  disabled={mode === 'year'}
                  onClick={() => toggleItem(selectedMonths, setSelectedMonths, i + 1)}
                  className={`px-2 py-1 rounded text-xs transition ${mode === 'year' ? 'opacity-30 cursor-not-allowed' : selectedMonths.includes(i + 1) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {m}
                </button>
              ))}
            </div>
            <h3 className="text-sm font-semibold mb-2 text-gray-300">Годы</h3>
            <div className="flex flex-wrap gap-1">
              {allYears.map(y => (
                <button key={y} onClick={() => toggleItem(selectedYears, setSelectedYears, y)}
                  className={`px-3 py-1 rounded text-xs transition ${selectedYears.includes(y) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Показатели</h3>
            <div className="space-y-2">
              {METRICS.map(m => (
                <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
                  <input type="checkbox" checked={selectedMetrics.includes(m.key)} onChange={() => toggleItem(selectedMetrics, setSelectedMetrics, m.key)} className="accent-blue-500" />
                  {m.label}
                </label>
              ))}
            </div>
            <button onClick={runCompare} disabled={loading}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
              {loading ? 'Загрузка...' : '▶ Сравнить'}
            </button>
            {rawFlatResults.length >= 2 && (
              <button onClick={() => setBaseIndex(i => i === 0 ? 1 : 0)}
                title="Поменять базу сравнения"
                className="w-full mt-2 flex items-center justify-center gap-2 bg-gray-700 hover:bg-amber-700 py-2 rounded-lg text-sm transition text-gray-300 hover:text-white">
                ⇄ База: <span className="font-medium text-white">{flatResults[0]?.key}</span>
                <span className="text-gray-500">→</span>
                <span className="text-amber-400">{flatResults[flatResults.length - 1]?.key}</span>
              </button>
            )}
          </div>
        </div>

        {hasResults && (
          <>
            {/* Таблица — обычный режим */}
            {!isStoreMonthMode && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Показатель</th>
                      {flatResults.map((r: any, i: number) => (
                        <th key={i} className="px-4 py-3 text-left font-medium" style={{ color: COLORS[i % COLORS.length] }}>{r.key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {METRICS.filter(m => selectedMetrics.includes(m.key)).map(metric => (
                      <tr key={metric.key} className="hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3 text-gray-400 font-medium">{metric.label}</td>
                        {flatResults.map((r: any, i: number) => (
                          <td key={i} className="px-4 py-3">
                            <div className="font-medium">{metric.format(r[metric.key] ?? 0)}</div>
                            {i > 0 && baseItem && (
                              <div className={`text-xs mt-0.5 ${pctColor(r[metric.key] ?? 0, baseItem[metric.key] ?? 0)}`}>
                                {pct(r[metric.key] ?? 0, baseItem[metric.key] ?? 0)}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end p-3 border-t border-gray-700">
                  <DownloadBtn onClick={downloadTable} title="Скачать таблицу сравнения" />
                </div>
              </div>
            )}

            {/* Таблица — store-month */}
            {isStoreMonthMode && storeMonthData && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Период</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Показатель</th>
                      {storeMonthData.stores.map((s: string, i: number) => (
                        <th key={i} className="px-4 py-3 text-left font-medium" style={{ color: COLORS[i % COLORS.length] }}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {storeMonthData.rows.map((row: any) =>
                      METRICS.filter(m => selectedMetrics.includes(m.key)).map((metric, mi) => (
                        <tr key={`${row.period}-${metric.key}`} className="hover:bg-gray-700/30 transition">
                          {mi === 0 && (
                            <td className="px-4 py-3 text-gray-400 font-medium align-top" rowSpan={selectedMetrics.length}>
                              {row.period}
                            </td>
                          )}
                          <td className="px-4 py-3 text-gray-500 text-xs">{metric.label}</td>
                          {storeMonthData.stores.map((s: string, si: number) => {
                            const cell = row[s] || { revenue: 0, grossProfit: 0, quantity: 0, checks: 0 }
                            let val = 0
                            if (metric.key === 'margin') val = cell.revenue > 0 ? (cell.grossProfit / cell.revenue) * 100 : 0
                            else if (metric.key === 'avgCheck') val = cell.checks > 0 ? cell.revenue / cell.checks : 0
                            else val = cell[metric.key] ?? 0
                            const baseCell = row[storeMonthData.stores[0]] || { revenue: 0, grossProfit: 0, quantity: 0, checks: 0 }
                            let baseVal = 0
                            if (metric.key === 'margin') baseVal = baseCell.revenue > 0 ? (baseCell.grossProfit / baseCell.revenue) * 100 : 0
                            else if (metric.key === 'avgCheck') baseVal = baseCell.checks > 0 ? baseCell.revenue / baseCell.checks : 0
                            else baseVal = baseCell[metric.key] ?? 0
                            return (
                              <td key={si} className="px-4 py-3">
                                <div className="font-medium">{metric.format(val)}</div>
                                {si > 0 && <div className={`text-xs mt-0.5 ${pctColor(val, baseVal)}`}>{pct(val, baseVal)}</div>}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="flex justify-end p-3 border-t border-gray-700">
                  <DownloadBtn onClick={downloadTable} title="Скачать таблицу сравнения" />
                </div>
              </div>
            )}

            {/* Графики */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-300">Графики</h3>
              <div className="flex items-center gap-2">
                {charts.length > 0 && (
                  <button onClick={downloadAllCharts} title="Скачать все графики"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-green-700 text-gray-400 hover:text-white transition text-sm border border-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Скачать все графики
                  </button>
                )}
                <button
                  onClick={() => setCharts(prev => [...prev, {
                    id: Date.now().toString(),
                    metrics: selectedMetrics.slice(0, 1),
                    chartType: 'bar',
                    showLabels: false,
                    showDots: false,
                    normalize: false
                  }])}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition"
                >
                  + Добавить график
                </button>
              </div>
            </div>

            {charts.map((cfg, idx) => (
              <ChartBlock
                key={cfg.id}
                config={cfg}
                flatResults={flatResults}
                storeMonthData={storeMonthData}
                isStoreMonthMode={isStoreMonthMode}
                onRemove={() => setCharts(prev => prev.filter(c => c.id !== cfg.id))}
                onUpdate={(updated) => setCharts(prev => prev.map(c => c.id === cfg.id ? updated : c))}
                chartIndex={idx}
              />
            ))}

            {charts.length === 0 && (
              <div className="bg-gray-800/50 rounded-xl p-6 border border-dashed border-gray-600 text-center text-gray-500 text-sm">
                Нажмите <span className="text-white">+ Добавить график</span> чтобы визуализировать данные
              </div>
            )}
          </>
        )}

        {!hasResults && !loading && (
          <div className="bg-gray-800 rounded-xl p-10 border border-gray-700 text-center text-gray-400">
            Выберите параметры и нажмите <span className="text-white font-medium">▶ Сравнить</span>
          </div>
        )}
      </div>
    </div>
  )
}