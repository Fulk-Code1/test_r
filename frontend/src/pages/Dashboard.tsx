import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar'
import SyncNotification from '../components/SyncNotification'

const API = import.meta.env.VITE_API_URL || '/api'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7']
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

const EXCLUDED_FROM_EXTRA = new Set(['revenue', 'quantity', 'checks', 'avgCheck', 'grossProfit', 'margin', 'label', 'year', 'month'])

// ─── Excel helpers ───────────────────────────────────────────────
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

// Иконка скачивания
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

// ─── Форматирование ───────────────────────────────────────────────
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

type ChartType = 'line' | 'bar' | 'bar-horizontal'
const ttStyle = { background: '#1f2937', border: '1px solid #374151', fontSize: 13 }
const ttProps = { contentStyle: ttStyle, labelStyle: { color: '#fff', fontSize: 13 }, itemStyle: { color: '#fff', fontSize: 13 } }

function ChartTypeSwitcher({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  return (
    <div className="flex gap-1">
      {(['line','bar','bar-horizontal'] as ChartType[]).map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-3 py-1.5 rounded text-sm transition ${value === t ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
          {t === 'line' ? 'Линейный' : t === 'bar' ? 'Столбцы' : 'Горизонтальные'}
        </button>
      ))}
    </div>
  )
}

// ─── SingleMetricChart ────────────────────────────────────────────
function SingleMetricChart({ title, data, dataKey, xKey, color, formatTooltip, filename }: {
  title: string; data: any[]; dataKey: string; xKey: string; color: string
  formatTooltip: (v: number) => string; filename: string
}) {
  const [chartType, setChartType] = useState<ChartType>('line')
  const [showLabels, setShowLabels] = useState(false)
  const [showDots, setShowDots] = useState(false)
  const [showAllHorizontal, setShowAllHorizontal] = useState(false)

  const preparedData = chartType === 'bar-horizontal'
    ? [...data].sort((a, b) => (b[dataKey] || 0) - (a[dataKey] || 0)).slice(0, showAllHorizontal ? data.length : 10)
    : data

  const dynamicHeight = chartType === 'bar-horizontal' ? 90 + preparedData.length * 42 : 320
  const barSize = chartType === 'bar-horizontal' ? (showAllHorizontal ? 16 : 28) : undefined
  const strokeWidth = chartType === 'bar-horizontal' ? (showAllHorizontal ? 0.5 : 1.5) : undefined
  const labelEl = showLabels ? (
    <LabelList dataKey={dataKey} position={chartType === 'bar-horizontal' ? 'right' : 'top'}
      formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: color }} />
  ) : null
  const xInterval = Math.floor(data.length / 10)

  const handleDownload = () => {
    const rows = data.map(r => ({ [xKey]: r[xKey], [title]: r[dataKey] ?? 0 }))
    xlsxDownload(rows, filename, title)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <ChartTypeSwitcher value={chartType} onChange={setChartType} />
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
            Значения
          </label>
          {chartType === 'line' && (
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={showDots} onChange={() => setShowDots(v => !v)} className="accent-blue-500 w-4 h-4" />
              Точки
            </label>
          )}
          {chartType === 'bar-horizontal' && data.length > 10 && (
            <button onClick={() => setShowAllHorizontal(!showAllHorizontal)}
              className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition">
              {showAllHorizontal ? 'Свернуть до топ-10' : 'Показать все'}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={dynamicHeight}>
        {chartType === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 12 }} interval={xInterval} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2.5}
              dot={showDots ? { stroke: color, strokeWidth: 2, r: 4 } : false}>{labelEl}</Line>
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 12 }} interval={xInterval} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey={dataKey} name={title} fill={color} radius={[5,5,0,0]}>{labelEl}</Bar>
          </BarChart>
        ) : (
          <BarChart data={preparedData} layout="vertical" barSize={barSize} barCategoryGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <YAxis type="category" dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 12 }} width={80} interval={0} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey={dataKey} name={title} fill={color} radius={[0,6,6,0]} stroke="#64748b" strokeWidth={strokeWidth}>{labelEl}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      {/* Кнопка скачивания под графиком справа */}
      <div className="flex justify-end mt-3">
        <DownloadBtn onClick={handleDownload} title={`Скачать «${title}»`} />
      </div>
    </div>
  )
}

// ─── MultiMetricChart ─────────────────────────────────────────────
function MultiMetricChart({ title, data, xKey, metrics, emptyMessage, filename }: {
  title: string; data: any[]; xKey: string
  metrics: { key: string; name: string; color: string }[]
  emptyMessage?: string; filename: string
}) {
  const [chartType, setChartType] = useState<ChartType>('line')
  const [active, setActive] = useState<string[]>(metrics.map(m => m.key))
  const [showLabels, setShowLabels] = useState(false)
  const [showDots, setShowDots] = useState(false)
  const [showAllHorizontal, setShowAllHorizontal] = useState(false)

  useEffect(() => { setActive(metrics.map(m => m.key)) }, [metrics.map(m => m.key).join(',')])

  const toggle = (key: string) =>
    setActive(prev => prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key])

  const visibleMetrics = metrics.filter(m => active.includes(m.key))
  const firstActiveKey = visibleMetrics[0]?.key
  const preparedData = chartType === 'bar-horizontal' && firstActiveKey
    ? [...data].sort((a, b) => (b[firstActiveKey] || 0) - (a[firstActiveKey] || 0)).slice(0, showAllHorizontal ? data.length : 10)
    : data

  const dynamicHeight = chartType === 'bar-horizontal' ? 100 + preparedData.length * 45 : 340
  const barSize = chartType === 'bar-horizontal' ? (showAllHorizontal ? 16 : 28) : undefined
  const strokeWidth = chartType === 'bar-horizontal' ? (showAllHorizontal ? 0.5 : 1.5) : undefined
  const xInterval = Math.floor(data.length / 10)

  const handleDownload = () => {
    const rows = data.map(r => {
      const obj: any = { [xKey]: r[xKey] }
      metrics.forEach(m => { obj[m.name] = r[m.key] ?? 0 })
      return obj
    })
    xlsxDownload(rows, filename, title)
  }

  if (metrics.length === 0) return (
    <div className="bg-gray-800 rounded-xl p-6 border border-dashed border-gray-600">
      <h3 className="font-semibold text-lg mb-3">{title}</h3>
      <p className="text-gray-500 text-sm text-center py-6">
        {emptyMessage || 'Данные появятся после добавления дополнительных полей'}
      </p>
    </div>
  )

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 12 }} interval={xInterval} />
      <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
      <Tooltip formatter={(v: any) => Number(v).toLocaleString()} {...ttProps} />
      <Legend wrapperStyle={{ fontSize: 13 }} />
    </>
  )

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <ChartTypeSwitcher value={chartType} onChange={setChartType} />
          {metrics.map(m => (
            <button key={m.key} onClick={() => toggle(m.key)}
              style={{
                background: active.includes(m.key) ? m.color + '22' : '#374151',
                color: active.includes(m.key) ? m.color : '#d1d5db',
                border: `1px solid ${active.includes(m.key) ? m.color : 'transparent'}`
              }}
              className="px-3 py-1.5 rounded text-sm transition">{m.name}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
            Значения
          </label>
          {chartType === 'line' && (
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={showDots} onChange={() => setShowDots(v => !v)} className="accent-blue-500 w-4 h-4" />
              Точки
            </label>
          )}
          {chartType === 'bar-horizontal' && data.length > 10 && (
            <button onClick={() => setShowAllHorizontal(!showAllHorizontal)}
              className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition">
              {showAllHorizontal ? 'Свернуть до топ-10' : 'Показать все'}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={dynamicHeight}>
        {chartType === 'line' ? (
          <LineChart data={data}>
            {axes}
            {visibleMetrics.map(m => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.name} stroke={m.color} strokeWidth={2.5}
                dot={showDots ? { stroke: m.color, strokeWidth: 2, r: 4 } : false}>
                {showLabels && <LabelList dataKey={m.key} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
              </Line>
            ))}
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data}>
            {axes}
            {visibleMetrics.map(m => (
              <Bar key={m.key} dataKey={m.key} name={m.name} fill={m.color} radius={[5,5,0,0]}>
                {showLabels && <LabelList dataKey={m.key} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
              </Bar>
            ))}
          </BarChart>
        ) : (
          <BarChart data={preparedData} layout="vertical" barSize={barSize} barCategoryGap={8}>
            {axes}
            {visibleMetrics.map(m => (
              <Bar key={m.key} dataKey={m.key} name={m.name} fill={m.color} radius={[0,6,6,0]} stroke="#64748b" strokeWidth={strokeWidth}>
                {showLabels && <LabelList dataKey={m.key} position="right" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
              </Bar>
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
      {/* Кнопка скачивания под графиком справа */}
      <div className="flex justify-end mt-3">
        <DownloadBtn onClick={handleDownload} title={`Скачать «${title}»`} />
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────
export default function Dashboard() {
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
  const [showStorePieLabels, setShowStorePieLabels] = useState(false)
  const [hasMappings, setHasMappings] = useState(true)
  const [extraFields, setExtraFields] = useState<{ key: string; name: string; color: string }[]>([])

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
      setKpi(kpiR.data); setTrend(trendR.data); setByStore(storeR.data)
      setYearTrend(yearR.data); setYears(yearsR.data)
      setHasMappings(mappingR.data.length > 0)
      const sample = trendR.data[0] || {}
      const dynamicKeys = Object.keys(sample).filter(k => !EXCLUDED_FROM_EXTRA.has(k))
      setExtraFields(dynamicKeys.map((k, i) => ({ key: k, name: k, color: COLORS[i % COLORS.length] })))
    } catch { console.error('fetch error') }
  }, [selectedYear])

  const fetchTable = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/sales/table`, {
        params: { page, limit: 15, search, ...(selectedYear ? { year: selectedYear } : {}) }
      })
      setTable(res.data.data); setTotal(res.data.total)
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
    } catch (e: any) { alert('Ошибка: ' + (e.response?.data?.error || e.message)) }
    setSyncing(false)
  }

  const trendWithCalc = trend.map(r => ({
    ...r,
    avgCheck: r.checks > 0 ? Math.round(r.revenue / r.checks) : 0,
    margin: r.revenue > 0 ? parseFloat(((r.grossProfit / r.revenue) * 100).toFixed(2)) : 0,
  }))

  const yearLabel = selectedYear ? `_${selectedYear}` : ''

  // ── Выгрузка всего таба ──
  const downloadOverview = () => {
    xlsxDownloadMulti([
      {
        name: 'Выручка',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Выручка (MDL)': r.revenue }))
      },
      {
        name: 'Кол-во продаж',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Кол-во продаж': r.quantity }))
      },
      {
        name: 'Кол-во чеков',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Кол-во чеков': r.checks }))
      },
      {
        name: 'Средний чек',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Средний чек (MDL)': r.avgCheck }))
      },
      {
        name: 'Валовая прибыль',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Вал. прибыль (MDL)': r.grossProfit }))
      },
      {
        name: 'Маржа',
        rows: trendWithCalc.map(r => ({ Период: r.label, 'Маржа (%)': r.margin }))
      },
      {
        name: 'По годам',
        rows: yearTrend.map(r => ({ Год: r.year, 'Выручка (MDL)': r.revenue, 'Вал. прибыль (MDL)': r.grossProfit, 'Кол-во': r.quantity }))
      },
      ...(extraFields.length > 0 ? [{
        name: 'Остальное',
        rows: trendWithCalc.map(r => {
          const obj: any = { Период: r.label }
          extraFields.forEach(f => { obj[f.name] = r[f.key] ?? 0 })
          return obj
        })
      }] : [])
    ], `Дашборд_Тренды${yearLabel}`)
  }

  const downloadBreakdown = () => {
    xlsxDownloadMulti([
      {
        name: 'Доля выручки по магазинам',
        rows: byStore.map(r => ({ Магазин: r.store, 'Выручка (MDL)': r.revenue }))
      },
      {
        name: 'Топ магазинов',
        rows: [...byStore].sort((a,b) => b.revenue - a.revenue).map((r, i) => ({
          '#': i + 1, Магазин: r.store, 'Выручка (MDL)': r.revenue
        }))
      }
    ], `Дашборд_Разбивка${yearLabel}`)
  }

  const downloadTable = () => {
    xlsxDownload(
      table.map(row => {
        const margin = row.revenue > 0 ? parseFloat(((row.grossProfit / row.revenue) * 100).toFixed(2)) : 0
        const avgCheck = row.checks > 0 ? Math.round(row.revenue / row.checks) : 0
        const obj: any = {
          Год: row.year,
          Месяц: MONTHS_FULL[row.month - 1],
          Магазин: row.store,
          'Выручка (MDL)': row.revenue,
          'Вал. прибыль (MDL)': row.grossProfit ?? 0,
          'Маржа (%)': margin,
          'Ср. чек (MDL)': avgCheck,
          'Кол-во продаж': row.quantity ?? 0,
          'Чеки': row.checks ?? 0,
        }
        extraFields.forEach(f => { obj[f.name] = row.extraData?.[f.key] ?? row[f.key] ?? '' })
        return obj
      }),
      `Дашборд_Таблица${yearLabel}`,
      'Данные'
    )
  }

  const kpiCards = kpi ? [
    { label: 'Выручка',       value: fmt(kpi.totalRevenue ?? 0),       color: 'text-blue-400' },
    { label: 'Кол-во продаж', value: (kpi.totalQuantity ?? 0).toLocaleString(), color: 'text-purple-400' },
    { label: 'Кол-во чеков',  value: (kpi.totalChecks ?? 0).toLocaleString(),   color: 'text-cyan-400' },
    { label: 'Ср. чек',       value: fmt(kpi.avgCheck ?? 0),           color: 'text-yellow-400' },
    { label: 'Вал. прибыль',  value: fmt(kpi.totalGrossProfit ?? 0),   color: 'text-green-400' },
    { label: 'Маржа', value: fmtPct(kpi.totalRevenue > 0 ? (kpi.totalGrossProfit / kpi.totalRevenue) * 100 : 0), color: 'text-pink-400' },
  ] : []

  const tabDownloadMap: Record<string, () => void> = {
    overview: downloadOverview,
    breakdown: downloadBreakdown,
    table: downloadTable,
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="dashboard" userRole={user?.role} rightSlot={
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpiCards.map((k, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Табы + иконка скачивания всего таба справа */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[
              { id: 'overview',  label: 'Тренды' },
              { id: 'breakdown', label: 'Разбивка' },
              { id: 'table',     label: 'Таблица' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          {/* Общая кнопка выгрузки текущего таба */}
          <button onClick={() => tabDownloadMap[activeTab]?.()}
            title="Скачать все данные этой страницы"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-green-700 text-gray-400 hover:text-white transition text-sm border border-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Скачать всё
          </button>
        </div>

        {/* Тренды */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SingleMetricChart title="Выручка" data={trendWithCalc} dataKey="revenue" xKey="label"
                color="#3b82f6" formatTooltip={v => `${v.toLocaleString()} MDL`} filename={`Выручка${yearLabel}`} />
              <SingleMetricChart title="Кол-во продаж (наполненность)" data={trendWithCalc} dataKey="quantity" xKey="label"
                color="#8b5cf6" formatTooltip={v => v.toLocaleString()} filename={`Кол-во_продаж${yearLabel}`} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SingleMetricChart title="Кол-во чеков" data={trendWithCalc} dataKey="checks" xKey="label"
                color="#06b6d4" formatTooltip={v => v.toLocaleString()} filename={`Кол-во_чеков${yearLabel}`} />
              <SingleMetricChart title="Средний чек" data={trendWithCalc} dataKey="avgCheck" xKey="label"
                color="#f59e0b" formatTooltip={v => `${v.toLocaleString()} MDL`} filename={`Средний_чек${yearLabel}`} />
            </div>
            <SingleMetricChart title="Валовая прибыль" data={trendWithCalc} dataKey="grossProfit" xKey="label"
              color="#10b981" formatTooltip={v => `${v.toLocaleString()} MDL`} filename={`Валовая_прибыль${yearLabel}`} />
            <SingleMetricChart title="Маржа (%)" data={trendWithCalc} dataKey="margin" xKey="label"
              color="#ec4899" formatTooltip={v => `${v.toFixed(1)}%`} filename={`Маржа${yearLabel}`} />
            <MultiMetricChart title="Остальное" data={trendWithCalc} xKey="label" metrics={extraFields}
              emptyMessage="Здесь будут отображаться дополнительные поля добавленные через Google Sheets или маппинг"
              filename={`Остальное${yearLabel}`} />
            <MultiMetricChart title="По годам" data={yearTrend} xKey="year"
              metrics={[
                { key: 'revenue',     name: 'Выручка',      color: '#3b82f6' },
                { key: 'grossProfit', name: 'Вал. прибыль', color: '#10b981' },
                { key: 'quantity',    name: 'Кол-во',       color: '#8b5cf6' },
              ]}
              filename="По_годам" />
          </div>
        )}

        {/* Разбивка */}
        {activeTab === 'breakdown' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-semibold text-lg">Доля выручки по магазинам</h3>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={showStorePieLabels} onChange={() => setShowStorePieLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
                    Значения
                  </label>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={byStore} dataKey="revenue" nameKey="store" cx="50%" cy="50%" outerRadius={110}
                    label={showStorePieLabels ? ({ payload, percent }) => `${payload.store} ${((percent ?? 0)*100).toFixed(0)}%` : false}>
                    {byStore.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} MDL`} {...ttProps} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-end mt-3">
                <DownloadBtn onClick={() => xlsxDownload(
                  byStore.map(r => ({ Магазин: r.store, 'Выручка (MDL)': r.revenue })),
                  `Доля_выручки_по_магазинам${yearLabel}`, 'Доля по магазинам'
                )} title="Скачать доля выручки по магазинам" />
              </div>
            </div>
            <SingleMetricChart title="Топ магазинов по выручке" data={byStore} dataKey="revenue" xKey="store"
              color="#8b5cf6" formatTooltip={v => `${v.toLocaleString()} MDL`} filename={`Топ_магазинов${yearLabel}`} />
          </div>
        )}

        {/* Таблица */}
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
                    {[
                      'Год','Месяц','Магазин','Выручка','Вал. прибыль','Маржа','Ср. чек','Кол-во продаж','Чеки',
                      ...extraFields.map(f => f.name)
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {table.map((row, i) => {
                    const margin = row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0
                    const avgCheck = row.checks > 0 ? row.revenue / row.checks : 0
                    return (
                      <tr key={i} className="hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3 text-gray-400">{row.year}</td>
                        <td className="px-4 py-3 text-gray-400">{MONTHS[row.month - 1]}</td>
                        <td className="px-4 py-3 text-blue-400 font-medium">{row.store}</td>
                        <td className="px-4 py-3 text-blue-400">{fmt(row.revenue)}</td>
                        <td className="px-4 py-3 text-green-400">{fmt(row.grossProfit ?? 0)}</td>
                        <td className="px-4 py-3 text-pink-400">{fmtPct(margin)}</td>
                        <td className="px-4 py-3 text-yellow-400">{fmt(avgCheck)}</td>
                        <td className="px-4 py-3">{(row.quantity ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-cyan-400">{(row.checks ?? 0).toLocaleString()}</td>
                        {extraFields.map(f => (
                          <td key={f.key} className="px-4 py-3 text-orange-400">
                            {row.extraData?.[f.key] ?? row[f.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
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