import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts'
import Navbar from '../components/Navbar'
import SyncNotification from '../components/SyncNotification'

const API = import.meta.env.VITE_API_URL || '/api'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7']
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M MDL`
  if (n >= 1_000) return `${(n/1_000).toFixed(0)}K MDL`
  return `${n.toFixed(0)} MDL`
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n/1_000).toFixed(0)}K`
  return `${n.toFixed(0)}`
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-gray-400 text-xs cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
      {label}
    </label>
  )
}

export default function MappingDashboard() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login' }
  const [kpi, setKpi] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [byStore, setByStore] = useState<any[]>([])
  const [yearTrend, setYearTrend] = useState<any[]>([])
  const [table, setTable] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [hasMappings, setHasMappings] = useState(true)
  const [showLabels, setShowLabels] = useState({ trend: false, yearBar: false, storePie: false, storeBar: false })
  const toggleLabel = (key: keyof typeof showLabels) => setShowLabels(prev => ({ ...prev, [key]: !prev[key] }))

  const fetchAll = useCallback(async () => {
    try {
      const yParam = selectedYear ? `?year=${selectedYear}` : ''
      const [kpiR, trendR, storeR, yearR, yearsR, mappingR] = await Promise.all([
        axios.get(`${API}/sales/kpi${yParam}`),
        axios.get(`${API}/sales/trend${yParam}`),
        axios.get(`${API}/sales/by-store${yParam}`),
        axios.get(`${API}/sales/by-year`),
        axios.get(`${API}/sales/years`),
        axios.get(`${API}/mapping`),
      ])
      setKpi(kpiR.data)
      setTrend(trendR.data)
      setByStore(storeR.data)
      setYearTrend(yearR.data)
      setYears(yearsR.data)
      setHasMappings(mappingR.data.length > 0)
    } catch { console.error('fetch error') }
  }, [selectedYear])

  const fetchTable = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/sales/table`, {
        params: { page, limit: 15, search, ...(selectedYear ? { year: selectedYear } : {}) }
      })
      setTable(res.data.data)
      setTotal(res.data.total)
    } catch { console.error('table error') }
  }, [page, search, selectedYear])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchTable() }, [fetchTable])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await axios.post(`${API}/sync`)
      await fetchAll(); await fetchTable()
      setSyncResult(res.data)
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message))
    }
    setSyncing(false)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="mapping" userRole={user?.role} rightSlot={
        <>
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setPage(1) }}
            className="bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-600">
            <option value="">Все годы</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleSync} disabled={syncing}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {syncing ? '⟳ Синхронизация...' : 'Sync Google Sheets'}
          </button>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">Выйти</button>
        </>
      } />

      {syncResult && <SyncNotification result={syncResult} onClose={() => setSyncResult(null)} />}

      <div className="p-6 space-y-6">
        {!hasMappings && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-400 text-sm">
            Маппинг не настроен. <a href="/mapping/settings" className="underline font-medium">Настройте маппинг</a> и выполните синхронизацию чтобы увидеть данные.
          </div>
        )}

        {kpi && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Выручка', value: fmt(kpi.totalRevenue) },
              { label: 'Вал. прибыль', value: fmt(kpi.totalGrossProfit) },
              { label: 'Маржа', value: fmtPct(kpi.margin) },
              { label: 'Ср. чек', value: fmt(kpi.avgCheck) },
            ].map((k, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs">{k.label}</p>
                <p className="text-2xl font-bold mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {['overview', 'breakdown', 'table'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {tab === 'overview' ? 'Тренды' : tab === 'breakdown' ? 'Разбивка' : 'Таблица'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">Выручка и прибыль по месяцам</h3>
                <Checkbox label="Значения" checked={showLabels.trend} onChange={() => toggleLabel('trend')} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 11 }} interval={Math.floor(trend.length / 10)} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} MDL`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Выручка" stroke="#3b82f6" strokeWidth={2} dot={false}>
                    {showLabels.trend && <LabelList dataKey="revenue" position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 9, fill: '#93c5fd' }} />}
                  </Line>
                  <Line type="monotone" dataKey="grossProfit" name="Вал. прибыль" stroke="#10b981" strokeWidth={2} dot={false}>
                    {showLabels.trend && <LabelList dataKey="grossProfit" position="bottom" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 9, fill: '#6ee7b7' }} />}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">Выручка и прибыль по годам</h3>
                <Checkbox label="Значения" checked={showLabels.yearBar} onChange={() => toggleLabel('yearBar')} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="year" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} MDL`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
                  <Legend />
                  <Bar dataKey="revenue" name="Выручка" fill="#3b82f6" radius={[4,4,0,0]}>
                    {showLabels.yearBar && <LabelList dataKey="revenue" position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 10, fill: '#93c5fd' }} />}
                  </Bar>
                  <Bar dataKey="grossProfit" name="Вал. прибыль" fill="#10b981" radius={[4,4,0,0]}>
                    {showLabels.yearBar && <LabelList dataKey="grossProfit" position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 10, fill: '#6ee7b7' }} />}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">Доля выручки по магазинам</h3>
                <Checkbox label="Значения" checked={showLabels.storePie} onChange={() => toggleLabel('storePie')} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byStore} dataKey="revenue" nameKey="store" cx="50%" cy="50%" outerRadius={100}
                    label={showLabels.storePie ? ({ payload, percent }) => `${payload.store} ${((percent ?? 0)*100).toFixed(0)}%` : false}>
                    {byStore.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} MDL`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">Топ магазинов по выручке</h3>
                <Checkbox label="Значения" checked={showLabels.storeBar} onChange={() => toggleLabel('storeBar')} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byStore} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="store" stroke="#9ca3af" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} MDL`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} />
                  <Bar dataKey="revenue" name="Выручка" fill="#8b5cf6" radius={[0,4,4,0]}>
                    {showLabels.storeBar && <LabelList dataKey="revenue" position="right" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 10, fill: '#c4b5fd' }} />}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'table' && (
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex gap-3">
              <input type="text" placeholder="Поиск по магазину..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              <span className="text-gray-400 text-sm self-center">Всего: {total}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700/50">
                  <tr>
                    {['Год','Месяц','Магазин','Выручка','Вал. прибыль','Маржа','Ср. чек','Наполн.','Чеки','Кол-во'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {table.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 text-gray-400">{row.year}</td>
                      <td className="px-4 py-3 text-gray-400">{MONTHS[row.month - 1]}</td>
                      <td className="px-4 py-3 text-blue-400 font-medium">{row.store}</td>
                      <td className="px-4 py-3 text-blue-400">{fmt(row.revenue)}</td>
                      <td className="px-4 py-3 text-green-400">{fmt(row.grossProfit)}</td>
                      <td className="px-4 py-3 text-purple-400">{fmtPct(row.margin)}</td>
                      <td className="px-4 py-3">{fmt(row.avgCheck)}</td>
                      <td className="px-4 py-3">{row.fillRate?.toFixed(1)}</td>
                      <td className="px-4 py-3 text-green-400">{row.checks.toLocaleString()}</td>
                      <td className="px-4 py-3">{row.quantity.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex justify-between items-center border-t border-gray-700">
              <button disabled={page === 1} onClick={() => setPage(p => p-1)}
                className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600 transition text-sm">← Назад</button>
              <span className="text-gray-400 text-sm">Стр. {page} из {Math.ceil(total/15)}</span>
              <button disabled={page >= Math.ceil(total/15)} onClick={() => setPage(p => p+1)}
                className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600 transition text-sm">Вперёд →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}