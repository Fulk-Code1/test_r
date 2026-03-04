import { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts' //Legend, (in between Tooltip & ResponsiveContainer)
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
  { key: 'revenue', label: 'Выручка', format: (v: number) => `${fmt(v)} MDL` },
  { key: 'grossProfit', label: 'Вал. прибыль', format: (v: number) => `${fmt(v)} MDL` },
  { key: 'quantity', label: 'Кол-во продаж', format: (v: number) => fmt(v) },
  { key: 'checks', label: 'Кол-во чеков', format: (v: number) => fmt(v) },
  { key: 'margin', label: 'Маржа', format: (v: number) => `${v.toFixed(1)}%` },
  { key: 'avgCheck', label: 'Ср. чек', format: (v: number) => `${fmt(v)} MDL` },
]

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
  const [results, setResults] = useState<any[]>([])
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
      if (selectedYears.length > 0) params.years = selectedYears.join(',')
      const res = await axios.get(`${API}/compare`, { params })
      setResults(res.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const baseItem = results[0]

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="compare" userRole={user?.role} rightSlot={
        <>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">Выйти</button>
        </>
      } />

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <h2 className="text-xl font-bold">🔍 Сравнение</h2>

        {/* Фильтры */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Режим сравнения */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Режим сравнения</h3>
            <div className="space-y-2">
              {[
                { val: 'store', label: 'По магазинам' },
                { val: 'month', label: 'По месяцам' },
                { val: 'year', label: 'По годам' },
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
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {allStores.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300 py-0.5">
                  <input type="checkbox" checked={selectedStores.includes(s)} onChange={() => toggleItem(selectedStores, setSelectedStores, s)}
                    className="accent-blue-500" />
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

          {/* Метрики */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">Показатели</h3>
            <div className="space-y-2">
              {METRICS.map(m => (
                <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
                  <input type="checkbox" checked={selectedMetrics.includes(m.key)} onChange={() => toggleItem(selectedMetrics, setSelectedMetrics, m.key)}
                    className="accent-blue-500" />
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
        {results.length > 0 && (
          <>
            {/* Таблица сравнения */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Показатель</th>
                    {results.map((r, i) => (
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
                      {results.map((r, i) => (
                        <td key={i} className="px-4 py-3">
                          <div className="font-medium">{metric.format(r[metric.key])}</div>
                          {i > 0 && baseItem && (
                            <div className={`text-xs mt-0.5 ${pctColor(r[metric.key], baseItem[metric.key])}`}>
                              {pct(r[metric.key], baseItem[metric.key])} vs {baseItem.key}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Графики */}
            {selectedMetrics.map(metricKey => {
              const metric = METRICS.find(m => m.key === metricKey)
              if (!metric) return null
              return (
                <div key={metricKey} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <h3 className="font-semibold mb-4">{metric.label}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={results}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="key" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                      <Tooltip formatter={(v: any) => metric.format(Number(v))} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
                      <Bar dataKey={metricKey} name={metric.label} radius={[4,4,0,0]}>
                        {results.map((_, i) => (
                          <rect key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </>
        )}

        {results.length === 0 && !loading && (
          <div className="bg-gray-800 rounded-xl p-10 border border-gray-700 text-center text-gray-400">
            Выберите параметры и нажмите <span className="text-white font-medium">▶ Сравнить</span>
          </div>
        )}
      </div>
    </div>
  )
}