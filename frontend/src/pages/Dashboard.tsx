import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const API = import.meta.env.VITE_API_URL || '/api'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7']
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n/1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const token = localStorage.getItem('token')!
  const headers = { Authorization: `Bearer ${token}` }

  const [kpi, setKpi] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [byStore, setByStore] = useState<any[]>([])
  const [yearTrend, setYearTrend] = useState<any[]>([])
  const [table, setTable] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')

  const fetchAll = useCallback(async () => {
    try {
      const yParam = selectedYear ? `?year=${selectedYear}` : ''
      const [kpiR, trendR, storeR, yearR, yearsR] = await Promise.all([
        axios.get(`${API}/sales/kpi${yParam}`, { headers }),
        axios.get(`${API}/sales/trend${yParam}`, { headers }),
        axios.get(`${API}/sales/by-store${yParam}`, { headers }),
        axios.get(`${API}/sales/by-year`, { headers }),
        axios.get(`${API}/sales/years`, { headers }),
      ])
      setKpi(kpiR.data)
      setTrend(trendR.data)
      setByStore(storeR.data)
      setYearTrend(yearR.data)
      setYears(yearsR.data)
    } catch { navigate('/login') }
  }, [selectedYear])

  const fetchTable = useCallback(async () => {
    const res = await axios.get(`${API}/sales/table`, {
      headers, params: { page, limit: 15, search, ...(selectedYear ? { year: selectedYear } : {}) }
    })
    setTable(res.data.data)
    setTotal(res.data.total)
  }, [page, search, selectedYear])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchTable() }, [fetchTable])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await axios.post(`${API}/sync`, {}, { headers })
      await fetchAll()
      await fetchTable()
      alert('Синхронизация прошла успешно!')
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message))
    }
    setSyncing(false)
  }

  const logout = () => { localStorage.clear(); navigate('/login') }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <h1 className="text-xl font-bold">Sales Dashboard</h1>
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(e.target.value); setPage(1) }}
            className="bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-600 ml-4"
          >
            <option value="">Все годы</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">👤 {user.name}</span>
          <button onClick={handleSync} disabled={syncing}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {syncing ? '⟳ Синхронизация...' : 'Sync Google Sheets'}
          </button>
          <button onClick={logout} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition">
            Выйти
          </button>
        </div>
      </nav>

      <div className="p-6 space-y-6">
        {kpi && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Общая выручка', value: fmt(kpi.totalRevenue) },
              { label: 'Кол-во продаж', value: kpi.totalQuantity.toLocaleString() },
              { label: 'Кол-во чеков', value: kpi.totalChecks.toLocaleString() },
              { label: 'Ср. чек', value: fmt(kpi.avgRevPerCheck) },
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
              {tab === 'overview' ? '📈 Тренды' : tab === 'breakdown' ? '📊 Разбивка' : '📋 Таблица'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold mb-4">Выручка по месяцам</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 11 }} interval={Math.floor(trend.length / 10)} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Выручка" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="checks" name="Чеки" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold mb-4">Выручка по годам</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="year" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                  <Bar dataKey="revenue" name="Выручка" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="quantity" name="Кол-во" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold mb-4">Доля выручки по магазинам</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byStore} dataKey="revenue" nameKey="store" cx="50%" cy="50%" outerRadius={100}
                    label={({ payload, percent }) => `${payload?.store} ${((percent ?? 0)*100).toFixed(0)}%`}>
                    {byStore.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold mb-4">Топ магазинов по выручке</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byStore} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="store" stroke="#9ca3af" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                  <Bar dataKey="revenue" name="Выручка" fill="#8b5cf6" radius={[0,4,4,0]} />
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
                    {['Год', 'Месяц', 'Магазин', 'Выручка', 'Кол-во продаж', 'Чеки'].map(h => (
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
                      <td className="px-4 py-3">{row.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-green-400">{row.checks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex justify-between items-center border-t border-gray-700">
              <button disabled={page === 1} onClick={() => setPage(p => p-1)}
                className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600 transition text-sm">
                ← Назад
              </button>
              <span className="text-gray-400 text-sm">Стр. {page} из {Math.ceil(total/15)}</span>
              <button disabled={page >= Math.ceil(total/15)} onClick={() => setPage(p => p+1)}
                className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600 transition text-sm">
                Вперёд →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
