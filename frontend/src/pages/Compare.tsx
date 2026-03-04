import { useState, useEffect } from 'react'
import axios from 'axios'
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

export default function Compare() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  const [allStores, setAllStores] = useState<string[]>([])
  const [allYears, setAllYears] = useState<number[]>([])                       
  const [mode, setMode] = useState<'store' | 'month' | 'year' | 'store-month'>('store')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['revenue', 'grossProfit', 'margin', 'avgCheck'])
  const [results, setResults] = useState<any>([])
  const [loading, setLoading] = useState(false)

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
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // ──────────────────────────────────────────────
  // Обработка разных форматов ответа
  const isStoreMonthMode = !Array.isArray(results) && results?.mode === 'store-month'
  const storeMonthData   = isStoreMonthMode ? results : null
  const flatResults      = isStoreMonthMode ? [] : (Array.isArray(results) ? results : [])
  const baseItem         = flatResults[0] ?? null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="compare" userRole={user?.role} rightSlot={
        <>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">
            Выйти
          </button>
        </>
      } />

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        <h2 className="text-xl font-bold">Сравнение</h2>

        {/* Фильтры */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Режим сравнения */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Режим сравнения</h3>
            <div className="space-y-2">
              {[
                { val: 'store',      label: 'По магазинам' },
                { val: 'month',      label: 'По месяцам' },
                { val: 'year',       label: 'По годам' },
                { val: 'store-month',label: 'Магазин по месяцам' },
              ].map(m => (
                <button
                  key={m.val}
                  onClick={() => setMode(m.val as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${mode === m.val ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Магазины */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Магазины</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {allStores.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300 py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedStores.includes(s)}
                    onChange={() => toggleItem(selectedStores, setSelectedStores, s)}
                    className="accent-blue-500"
                  />
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
                <button
                  key={i}
                  onClick={() => toggleItem(selectedMonths, setSelectedMonths, i + 1)}
                  className={`px-2 py-1 rounded text-xs transition ${selectedMonths.includes(i + 1) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <h3 className="text-sm font-semibold mb-2 text-gray-300">Годы</h3>
            <div className="flex flex-wrap gap-1">
              {allYears.map(y => (
                <button
                  key={y}
                  onClick={() => toggleItem(selectedYears, setSelectedYears, y)}
                  className={`px-3 py-1 rounded text-xs transition ${selectedYears.includes(y) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
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
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.key)}
                    onChange={() => toggleItem(selectedMetrics, setSelectedMetrics, m.key)}
                    className="accent-blue-500"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <button
              onClick={runCompare}
              disabled={loading || (mode === 'store' && selectedStores.length === 0)}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition"
            >
              {loading ? 'Загрузка...' : '▶ Сравнить'}
            </button>
          </div>
        </div>

        {/* Результаты */}
        {(flatResults.length > 0 || storeMonthData) && (
          <>
            {/* Обычный режим (по магазинам / месяцам / годам) */}
            {!isStoreMonthMode && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Показатель</th>
                      {flatResults.map((r: any, i: number) => (
                        <th key={i} className="px-4 py-3 text-left font-medium" style={{ color: COLORS[i % COLORS.length] }}>
                          {r.key}
                        </th>
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

            {/* Режим store-month: строки = период, столбцы = магазины */}
            {isStoreMonthMode && storeMonthData && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Период</th>
                      <th className="px-4 py-3 text-left text-gray-400 font-medium">Показатель</th>
                      {storeMonthData.stores.map((s: string, i: number) => (
                        <th key={i} className="px-4 py-3 text-left font-medium" style={{ color: COLORS[i % COLORS.length] }}>
                          {s}
                        </th>
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
                            const cell = row[s] || { revenue: 0, grossProfit: 0, checks: 0 }
                            let val = 0
                            if (metric.key === 'margin') {
                              val = cell.revenue > 0 ? (cell.grossProfit / cell.revenue) * 100 : 0
                            } else if (metric.key === 'avgCheck') {
                              val = cell.checks > 0 ? cell.revenue / cell.checks : 0
                            } else {
                              val = cell[metric.key] ?? 0
                            }

                            const baseCell = row[storeMonthData.stores[0]] || { revenue: 0, grossProfit: 0, checks: 0 }
                            let baseVal = 0
                            if (metric.key === 'margin') {
                              baseVal = baseCell.revenue > 0 ? (baseCell.grossProfit / baseCell.revenue) * 100 : 0
                            } else if (metric.key === 'avgCheck') {
                              baseVal = baseCell.checks > 0 ? baseCell.revenue / baseCell.checks : 0
                            } else {
                              baseVal = baseCell[metric.key] ?? 0
                            }

                            return (
                              <td key={si} className="px-4 py-3">
                                <div className="font-medium">{metric.format(val)}</div>
                                {si > 0 && (
                                  <div className={`text-xs mt-0.5 ${pctColor(val, baseVal)}`}>
                                    {pct(val, baseVal)}
                                  </div>
                                )}
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
          </>
        )}

        {results.length === 0 && !loading && !storeMonthData && (
          <div className="bg-gray-800 rounded-xl p-10 border border-gray-700 text-center text-gray-400">
            Выберите параметры и нажмите <span className="text-white font-medium">▶ Сравнить</span>
          </div>
        )}
      </div>
    </div>
  )
}