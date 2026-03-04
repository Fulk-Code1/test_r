import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Navbar from '../components/Navbar'

const API = import.meta.env.VITE_API_URL || '/api'
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316']

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
// type ChartMode = 'one' | 'separate'

interface ChartConfig {
  id: string
  metrics: string[]
  chartType: ChartType
}

// Строим данные для графика в обычном режиме (flatResults)
function buildChartData(flatResults: any[], metrics: string[]) {
  return flatResults.map(r => {
    const obj: any = { key: r.key }
    metrics.forEach(m => { obj[m] = r[m] ?? 0 })
    return obj
  })
}

// Строим данные для графика в режиме store-month
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

function ChartBlock({
  config, flatResults, storeMonthData, isStoreMonthMode, onRemove, onUpdate
}: {
  config: ChartConfig
  flatResults: any[]
  storeMonthData: any
  isStoreMonthMode: boolean
  onRemove: () => void
  onUpdate: (cfg: ChartConfig) => void
}) {
  // const metric = METRICS.find(m => m.key === config.metrics[0])

  const renderChart = () => {
    if (isStoreMonthMode && storeMonthData) {
      const data = buildStoreMonthChartData(storeMonthData, config.metrics)
      const keys: string[] = []
      storeMonthData.stores.forEach((s: string) => {
        config.metrics.forEach((m: string) => keys.push(`${s}__${m}`))
      })

      if (config.chartType === 'line') {
        return (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
              <Legend />
              {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} name={k.replace('__', ' — ')} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        )
      }
      if (config.chartType === 'bar-horizontal') {
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <YAxis type="category" dataKey="key" stroke="#9ca3af" tick={{ fontSize: 10 }} width={80} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
              <Legend />
              {keys.map((k, i) => <Bar key={k} dataKey={k} name={k.replace('__', ' — ')} fill={COLORS[i % COLORS.length]} radius={[0,4,4,0]} />)}
            </BarChart>
          </ResponsiveContainer>
        )
      }
      // bar (default)
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
            <Legend />
            {keys.map((k, i) => <Bar key={k} dataKey={k} name={k.replace('__', ' — ')} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]} />)}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    // обычный режим
    const data = buildChartData(flatResults, config.metrics)

    if (config.chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
            <Legend />
            {config.metrics.map((m, i) => {
              const met = METRICS.find(x => x.key === m)
              return <Line key={m} type="monotone" dataKey={m} name={met?.label || m} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            })}
          </LineChart>
        </ResponsiveContainer>
      )
    }
    if (config.chartType === 'bar-horizontal') {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
            <YAxis type="category" dataKey="key" stroke="#9ca3af" tick={{ fontSize: 10 }} width={80} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
            <Legend />
            {config.metrics.map((m, i) => {
              const met = METRICS.find(x => x.key === m)
              return <Bar key={m} dataKey={m} name={met?.label || m} fill={COLORS[i % COLORS.length]} radius={[0,4,4,0]} />
            })}
          </BarChart>
        </ResponsiveContainer>
      )
    }
    // bar
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
          <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
          <Legend />
          {config.metrics.map((m, i) => {
            const met = METRICS.find(x => x.key === m)
            return <Bar key={m} dataKey={m} name={met?.label || m} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]} />
          })}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      {/* Шапка графика */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Тип графика */}
          {(['bar','line','bar-horizontal'] as ChartType[]).map(t => (
            <button key={t} onClick={() => onUpdate({ ...config, chartType: t })}
              className={`px-3 py-1 rounded text-xs font-medium transition ${config.chartType === t ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {t === 'bar' ? 'Bar' : t === 'line' ? 'Line' : 'Horizontal'}
            </button>
          ))}
          <span className="text-gray-600 text-xs mx-1">|</span>
          {/* Показатели на этом графике */}
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
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-sm transition">✕ Удалить</button>
      </div>
      {renderChart()}
    </div>
  )
}

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
      setCharts([]) // сброс графиков при новом сравнении
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const addChart = () => {
    setCharts(prev => [...prev, {
      id: Date.now().toString(),
      metrics: selectedMetrics.slice(0, 1),
      chartType: 'bar'
    }])
  }

  const updateChart = (id: string, cfg: ChartConfig) => {
    setCharts(prev => prev.map(c => c.id === id ? cfg : c))
  }

  const removeChart = (id: string) => {
    setCharts(prev => prev.filter(c => c.id !== id))
  }

  const isStoreMonthMode = !Array.isArray(results) && results?.mode === 'store-month'
  const storeMonthData   = isStoreMonthMode ? results : null
  const flatResults      = isStoreMonthMode ? [] : (Array.isArray(results) ? results : [])
  const baseItem         = flatResults[0] ?? null
  const hasResults       = flatResults.length > 0 || !!storeMonthData

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

          {/* Режим */}
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

          {/* Магазины */}
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

          {/* Месяцы + Годы */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Месяцы</h3>
            <div className="grid grid-cols-3 gap-1 mb-4">
              {MONTHS.map((m, i) => (
                <button key={i} onClick={() => toggleItem(selectedMonths, setSelectedMonths, i + 1)}
                  className={`px-2 py-1 rounded text-xs transition ${selectedMonths.includes(i + 1) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
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

          {/* Метрики + кнопка */}
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
          </div>
        </div>

        {/* Результаты */}
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
                            <td className="px-4 py-3 text-gray-400 font-medium align-top" rowSpan={selectedMetrics.filter(m => selectedMetrics.includes(m)).length}>
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
              </div>
            )}

            {/* Графики */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-300">Графики</h3>
              <button onClick={addChart}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition">
                + Добавить график
              </button>
            </div>

            {charts.map(cfg => (
              <ChartBlock
                key={cfg.id}
                config={cfg}
                flatResults={flatResults}
                storeMonthData={storeMonthData}
                isStoreMonthMode={isStoreMonthMode}
                onRemove={() => removeChart(cfg.id)}
                onUpdate={(updated) => updateChart(cfg.id, updated)}
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