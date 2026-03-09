import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine
} from 'recharts'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar'
import { useLang } from '../LangContext'
import SyncNotification from '../components/SyncNotification'

const API = import.meta.env.VITE_API_URL || '/api'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7']
// MONTHS now generated from translations via useLang hook inside component
// MONTHS_FULL now generated from translations
const EXCLUDED_FROM_EXTRA = new Set(['revenue', 'quantity', 'checks', 'avgCheck', 'grossProfit', 'margin', 'label', 'year', 'month', 'storeCount', 'avgQuantityPerStore', 'avgPrice'])

// ─── Flex chart metrics ──────────────────────────────────────────
const FLEX_METRICS = [
  { key: 'revenue',            nameKey: 'metric_revenue' as const,    color: '#3b82f6', isPercent: false },
  { key: 'grossProfit',        nameKey: 'metric_gross' as const,      color: '#10b981', isPercent: false },
  { key: 'quantity',           nameKey: 'metric_quantity' as const,   color: '#8b5cf6', isPercent: false, isSecondary: true },
  { key: 'checks',             nameKey: 'metric_checks' as const,     color: '#06b6d4', isPercent: false, isSecondary: true },
  { key: 'margin',             nameKey: 'metric_margin' as const,     color: '#ec4899', isPercent: true  },
  { key: 'avgCheck',           nameKey: 'metric_avg_check' as const,  color: '#f59e0b', isPercent: false },
  { key: 'avgPrice',           nameKey: 'metric_avg_price' as const,  color: '#f97316', isPercent: false },
]

// ─── Excel helpers ───────────────────────────────────────────────
function xlsxDownload(rows: Record<string, any>[], filename: string, sheetName = 'Данные') {
  if (!rows?.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
function xlsxDownloadMulti(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    if (!rows?.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2 }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function DownloadBtn({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title || 'Download'}
      style={{ background: 'var(--bg-input)' }} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-green-700 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition text-xs">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
      </svg>
      .xlsx
    </button>
  )
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}
function fmt(n: number) { return `${fmtNum(n)} MDL` }
function fmtShort(n: number) { return fmtNum(n) }
function fmtPct(n: number) { return `${n.toFixed(1).replace('.', ',')} %` }

type ChartType = 'line' | 'bar' | 'bar-horizontal'
const ttStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13 }
const ttProps = { contentStyle: ttStyle, labelStyle: { color: 'var(--text-primary)', fontSize: 13 }, itemStyle: { color: 'var(--text-primary)', fontSize: 13 } }

function ChartTypeSwitcher({ value, onChange, t }: { value: ChartType; onChange: (t: ChartType) => void; t: (k: any) => string }) {
  return (
    <div className="flex gap-1">
      {(['line','bar','bar-horizontal'] as ChartType[]).map(ct => (
        <button key={ct} onClick={() => onChange(ct)}
          className={`px-3 py-1.5 rounded text-sm transition ${value === ct ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
          {ct === 'line' ? t('ctrl_line') : ct === 'bar' ? t('ctrl_bar') : t('ctrl_bar_h')}
        </button>
      ))}
    </div>
  )
}

// ─── SingleMetricChart ────────────────────────────────────────────
function SingleMetricChart({ title, data, dataKey, xKey, color, formatTooltip, filename, extraControls, t }: {
  title: string; data: any[]; dataKey: string; xKey: string; color: string
  formatTooltip: (v: number) => string; filename: string; extraControls?: React.ReactNode; t: (k: any) => string
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

  const chartMargin = showLabels
    ? chartType === 'bar-horizontal' ? { right: 60 } : { top: 24 }
    : chartType === 'bar-horizontal' ? { right: 10 } : {}
  const xInterval = Math.floor(data.length / 10)

  return (
    <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <ChartTypeSwitcher value={chartType} onChange={setChartType} t={t} />
          <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
            {t('ctrl_values')}
          </label>
          {chartType === 'line' && (
            <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={showDots} onChange={() => setShowDots(v => !v)} className="accent-blue-500 w-4 h-4" />
              {t('ctrl_dots')}
            </label>
          )}
          {extraControls}
          {chartType === 'bar-horizontal' && data.length > 10 && (
            <button onClick={() => setShowAllHorizontal(!showAllHorizontal)}
              style={{ background: 'var(--bg-input)' }} className="px-3 py-1.5 rounded text-sm hover:bg-[var(--bg-hover)] text-[color:var(--text-primary)] transition">
              {showAllHorizontal ? t('ctrl_collapse') : t('ctrl_show_all')}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={dynamicHeight}>
        {chartType === 'line' ? (
          <LineChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} interval={xInterval} />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2.5}
              dot={showDots ? { stroke: color, strokeWidth: 2, r: 4 } : false}>{labelEl}</Line>
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} interval={xInterval} />
            <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey={dataKey} name={title} fill={color} radius={[5,5,0,0]}>{labelEl}</Bar>
          </BarChart>
        ) : (
          <BarChart data={preparedData} layout="vertical" barSize={barSize} barCategoryGap={8} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
            <YAxis type="category" dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} width={80} interval={0} />
            <Tooltip formatter={(v: any) => formatTooltip(Number(v))} {...ttProps} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey={dataKey} name={title} fill={color} radius={[0,6,6,0]} stroke="#64748b" strokeWidth={strokeWidth}>{labelEl}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      <div className="flex justify-end mt-3">
        <DownloadBtn onClick={() => xlsxDownload(data.map(r => ({ [xKey]: r[xKey], [title]: r[dataKey] ?? 0 })), filename, title)} title={`${t('action_download')} «${title}»`} />
      </div>
    </div>
  )
}

// ─── MultiMetricChart ─────────────────────────────────────────────
function MultiMetricChart({ title, data, xKey, metrics, emptyMessage, filename, dualAxis, normalize, extraControls, t }: {
  title: string; data: any[]; xKey: string
  metrics: { key: string; name: string; color: string; isPercent?: boolean; isSecondary?: boolean }[]
  emptyMessage?: string; filename: string; dualAxis?: boolean; normalize?: boolean; extraControls?: React.ReactNode; t: (k: any) => string
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
  const xInterval = Math.floor(data.length / 10)

  // Нормализация: каждый ряд приводим к 0-100 для читаемости на одной оси
  const normalizedData = normalize ? data.map(row => {
    const obj: any = { ...row }
    metrics.forEach(m => {
      const vals = data.map(r => r[m.key] ?? 0)
      const max = Math.max(...vals)
      obj[`__norm_${m.key}`] = max > 0 ? ((row[m.key] ?? 0) / max) * 100 : 0
    })
    return obj
  }) : data

  const handleDownload = () => {
    const rows = data.map(r => {
      const obj: any = { [xKey]: r[xKey] }
      metrics.forEach(m => { obj[m.name] = r[m.key] ?? 0 })
      return obj
    })
    xlsxDownload(rows, filename, title)
  }

  if (metrics.length === 0) return (
    <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-dashed border-[var(--border)]">
      <h3 className="font-semibold text-lg mb-3">{title}</h3>
      <p className="text-[color:var(--text-faint)] text-sm text-center py-6">
        {emptyMessage || t('no_data_extra')}
      </p>
    </div>
  )

  const tooltipEl = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ color: 'var(--text-primary)', fontSize: 13, marginBottom: 6 }}>{label}</p>
        {payload.map((entry: any) => {
          const m = metrics.find(x => x.name === entry.name)
          const realVal = normalize ? entry.payload[m?.key || ''] : entry.value
          const formatted = m?.isPercent
            ? `${Number(realVal).toFixed(1)}%`
            : m?.isSecondary
              ? fmtNum(Number(realVal))
              : fmt(Number(realVal))
          return (
            <p key={entry.name} style={{ color: entry.color, fontSize: 13, margin: '2px 0' }}>
              {entry.name}: <strong>{formatted}</strong>
            </p>
          )
        })}
      </div>
    )
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} interval={xInterval} />
      <YAxis yAxisId="left" stroke="var(--chart-axis)" tick={{ fontSize: 12 }}
        tickFormatter={v => normalize ? `${v.toFixed(0)}%` : fmtShort(v)}
        domain={normalize ? [0, 100] : undefined} />
      {dualAxis && !normalize && (
        <YAxis yAxisId="right" orientation="right" stroke="#3b82f6"
          tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} domain={[0, 'auto']} />
      )}
      <Tooltip content={tooltipEl} />
      <Legend wrapperStyle={{ fontSize: 13 }} />
    </>
  )

  const axesHorizontal = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }}
        tickFormatter={v => normalize ? `${Number(v).toFixed(0)}%` : fmtShort(v)}
        domain={normalize ? [0, 100] : undefined} />
      <YAxis type="category" dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} width={80} interval={0} />
      <Tooltip content={tooltipEl} />
      <Legend wrapperStyle={{ fontSize: 13 }} />
    </>
  )

  const getYAxisId = (m: { isPercent?: boolean; isSecondary?: boolean }) => {
    if (normalize) return 'left'
    if (dualAxis) return (m.isPercent || m.isSecondary) ? 'right' : 'left'
    return 'left'
  }

  const chartData = normalize ? normalizedData : data
  const chartDataKey = (m: { key: string }) => normalize ? `__norm_${m.key}` : m.key

  return (
    <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <ChartTypeSwitcher value={chartType} onChange={setChartType} t={t} />
          {metrics.map(m => (
            <button key={m.key} onClick={() => toggle(m.key)}
              style={{
                background: active.includes(m.key) ? m.color + '22' : 'var(--bg-input)',
                color: active.includes(m.key) ? m.color : 'var(--text-secondary)',
                border: `1px solid ${active.includes(m.key) ? m.color : 'transparent'}`
              }}
              className="px-3 py-1.5 rounded text-sm transition">{m.name}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
            {t('ctrl_values')}
          </label>
          {chartType === 'line' && (
            <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={showDots} onChange={() => setShowDots(v => !v)} className="accent-blue-500 w-4 h-4" />
              {t('ctrl_dots')}
            </label>
          )}
          {extraControls}
          {chartType === 'bar-horizontal' && data.length > 10 && (
            <button onClick={() => setShowAllHorizontal(!showAllHorizontal)}
              style={{ background: 'var(--bg-input)' }} className="px-3 py-1.5 rounded text-sm hover:bg-[var(--bg-hover)] text-[color:var(--text-primary)] transition">
              {showAllHorizontal ? t('ctrl_collapse') : t('ctrl_show_all')}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={dynamicHeight}>
        {chartType === 'line' ? (
          <LineChart data={chartData}>
            {axes}
            {visibleMetrics.map(m => (
              <Line key={m.key} yAxisId={getYAxisId(m)}
                type="monotone" dataKey={chartDataKey(m)} name={m.name} stroke={m.color} strokeWidth={2.5}
                dot={showDots ? { stroke: m.color, strokeWidth: 2, r: 4 } : false}>
                {showLabels && <LabelList dataKey={chartDataKey(m)} position="top"
                  formatter={(v: any) => m.isPercent ? `${Number(v).toFixed(1)}%` : fmtShort(v)}
                  style={{ fontSize: 11, fill: m.color }} />}
              </Line>
            ))}
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={chartData}>
            {axes}
            {visibleMetrics.map(m => (
              <Bar key={m.key} yAxisId={getYAxisId(m)}
                dataKey={chartDataKey(m)} name={m.name} fill={m.color} radius={[5,5,0,0]}>
                {showLabels && <LabelList dataKey={chartDataKey(m)} position="top"
                  formatter={(v: any) => m.isPercent ? `${Number(v).toFixed(1)}%` : fmtShort(v)}
                  style={{ fontSize: 11, fill: m.color }} />}
              </Bar>
            ))}
          </BarChart>
        ) : (
          <BarChart data={normalize ? normalizedData.slice(0, showAllHorizontal ? data.length : 10) : preparedData}
            layout="vertical" barSize={barSize} barCategoryGap={8} margin={{ right: showLabels ? 60 : 10 }}>
            {axesHorizontal}
            {visibleMetrics.map(m => (
              <Bar key={m.key}
                dataKey={chartDataKey(m)} name={m.name} fill={m.color} radius={[0,6,6,0]}>
                {showLabels && <LabelList dataKey={chartDataKey(m)} position="right"
                  formatter={(v: any) => m.isPercent ? `${Number(v).toFixed(1)}%` : fmtShort(v)}
                  style={{ fontSize: 11, fill: m.color }} />}
              </Bar>
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
      <div className="flex justify-end mt-3">
        <DownloadBtn onClick={handleDownload} title={`${t('action_download')} «${title}»`} />
      </div>
    </div>
  )
}

// ─── SortTh ──────────────────────────────────────────────────────
function SortTh({ col, label, sortBy, sortDir, onSort }: { col: string; label: string; sortBy: string; sortDir: 'asc'|'desc'; onSort: (col: string) => void }) {
  return (
    <th onClick={() => onSort(col)}
      className="px-4 py-3 text-left text-[color:var(--text-muted)] font-medium whitespace-nowrap cursor-pointer select-none hover:text-[color:var(--text-primary)] transition">
      {label} {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-[color:var(--text-faint)]">↕</span>}
    </th>
  )
}

// ─── StoreDropdown ────────────────────────────────────────────────
function StoreDropdown({ stores, selected, onChange, t }: { stores: string[]; selected: string[]; onChange: (s: string[]) => void; t: (k: any) => string }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const toggle = (s: string) => onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition
          ${selected.length > 0 ? 'bg-blue-600/20 border-blue-500 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] border-[var(--border)] text-[color:var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}>
        <span>{selected.length > 0 ? `${t('filter_selected')} ${selected.length}` : t('filter_all_stores')}</span>
        <span className="text-[color:var(--text-muted)] ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--bg-card)' }} className="absolute z-50 mt-1 w-full min-w-[200px] border border-[var(--border)] rounded-xl shadow-2xl p-2 space-y-0.5 max-h-64 overflow-y-auto">
          <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-[color:var(--text-muted)] hover:bg-[var(--bg-hover)] transition">
            {t('filter_clear_all')}
          </button>
          {stores.map(s => (
            <label key={s} className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition text-sm text-[color:var(--text-primary)]">
              <input type="checkbox" className="accent-blue-500" checked={selected.includes(s)} onChange={() => toggle(s)} />
              {s}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── RangeDropdown ────────────────────────────────────────────────
const RANGE_PRESETS: Record<string, { label: string; value: string }[]> = {
  MDL: [
    { label: '10,000', value: '10000' }, { label: '50,000', value: '50000' },
    { label: '100,000', value: '100000' }, { label: '250,000', value: '250000' },
    { label: '500,000', value: '500000' }, { label: '1,000,000', value: '1000000' },
  ],
  '%': [
    { label: '5%', value: '5' }, { label: '10%', value: '10' },
    { label: '15%', value: '15' }, { label: '20%', value: '20' },
    { label: '30%', value: '30' }, { label: '50%', value: '50' },
  ],
  '': [
    { label: '100', value: '100' }, { label: '500', value: '500' },
    { label: '1,000', value: '1000' }, { label: '5,000', value: '5000' },
    { label: '10,000', value: '10000' },
  ],
}

function RangeDropdown({ label, unit, min, setMin, max, setMax, onApply, t }: {
  label: string; unit: string
  min: string; setMin: (v: string) => void
  max: string; setMax: (v: string) => void
  onApply: () => void; t: (k: any) => string
}) {
  const [open, setOpen] = useState(false)
  const [focusedField, setFocusedField] = useState<'min' | 'max' | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setFocusedField(null) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const isActive = min !== '' || max !== ''
  const presets = RANGE_PRESETS[unit] ?? RANGE_PRESETS['']
  const applyPreset = (value: string) => {
    if (focusedField === 'min') { setMin(value); onApply() }
    else if (focusedField === 'max') { setMax(value); onApply() }
  }
  const displayLabel = isActive
    ? `${label}: ${min ? (unit === 'MDL' ? fmtNum(Number(min)) : min + (unit || '')) : '—'} → ${max ? (unit === 'MDL' ? fmtNum(Number(max)) : max + (unit || '')) : '—'}`
    : label
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition
          ${isActive ? 'bg-blue-600/20 border-blue-500 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] border-[var(--border)] text-[color:var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}>
        <span className="truncate">{displayLabel}</span>
        <span className="text-[color:var(--text-muted)] ml-1 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--bg-card)' }} className="absolute z-50 mt-1 left-0 w-64 border border-[var(--border)] rounded-xl shadow-2xl p-4 space-y-3">
          <p className="text-xs text-[color:var(--text-muted)] font-medium">{label}{unit ? ` (${unit})` : ''}</p>
          <div className="space-y-2">
            <div className="relative">
              <input type="number" placeholder="От" value={min}
                onFocus={() => setFocusedField('min')}
                onChange={e => { setMin(e.target.value); onApply() }}
                className={`w-full bg-[var(--bg-input)] text-[color:var(--text-primary)] rounded-lg px-3 py-2 text-sm outline-none transition
                  ${focusedField === 'min' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-600'}`} />
              {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] text-xs pointer-events-none">{unit}</span>}
            </div>
            <div className="relative">
              <input type="number" placeholder="До" value={max}
                onFocus={() => setFocusedField('max')}
                onChange={e => { setMax(e.target.value); onApply() }}
                className={`w-full bg-[var(--bg-input)] text-[color:var(--text-primary)] rounded-lg px-3 py-2 text-sm outline-none transition
                  ${focusedField === 'max' ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-600'}`} />
              {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] text-xs pointer-events-none">{unit}</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-[color:var(--text-faint)] mb-1.5">
              {focusedField ? `${t('filter_quick')} → ${focusedField === 'min' ? t('filter_from') : t('filter_to')}` : t('map_select_field')}
            </p>
            <div className="flex flex-wrap gap-1">
              {presets.map(p => (
                <button key={p.value} onClick={() => applyPreset(p.value)} disabled={!focusedField}
                  className={`px-2 py-1 rounded text-xs transition
                    ${!focusedField ? 'bg-[var(--bg-input)]/50 text-[color:var(--text-faint)] cursor-not-allowed' :
                      (focusedField === 'min' ? min === p.value : max === p.value)
                        ? 'bg-blue-600 text-[color:var(--text-primary)]'
                        : 'bg-[var(--bg-input)] hover:bg-blue-600/40 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {isActive && (
            <button onClick={() => { setMin(''); setMax(''); onApply(); setOpen(false); setFocusedField(null) }}
              className="w-full text-xs text-red-400 hover:text-red-300 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition">
              {`✕ ${t('filter_clear')}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useLang()
  const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12].map(i => t(`mon_${i}` as any))
  const MONTHS_FULL = [1,2,3,4,5,6,7,8,9,10,11,12].map(i => t(`mon_full_${i}` as any))
  const FLEX_METRICS_T = FLEX_METRICS.map(m => ({ ...m, name: t(m.nameKey) }))
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login' }

  const [kpi, setKpi] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [byStore, setByStore] = useState<any[]>([])
  const [yearTrend, setYearTrend] = useState<any[]>([])
  const [table, setTable] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [years, setYears] = useState<number[]>([])
  const [allStores, setAllStores] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [showStorePieLabels, setShowStorePieLabels] = useState(false)
  const [hasMappings, setHasMappings] = useState(true)
  const [extraFields, setExtraFields] = useState<{ key: string; name: string; color: string }[]>([])

  const [normAvgCheck, setNormAvgCheck] = useState(false)
  const [storeTrend, setStoreTrend] = useState<{ periods: any[]; stores: string[] }>({ periods: [], stores: [] })
  const [storeTrendSelectedStores, setStoreTrendSelectedStores] = useState<string[]>([])
  const [storeTrendMetric, setStoreTrendMetric] = useState<string>('revenue')
  const [storeTrendType, setStoreTrendType] = useState<ChartType>('line')
  const [storeTrendShowDots, setStoreTrendShowDots] = useState(false)
  const [storeTrendShowLabels, setStoreTrendShowLabels] = useState(false)
  const [flexChart, setFlexChart] = useState<{
    metrics: string[]; chartType: ChartType; showLabels: boolean; showDots: boolean; normalize: boolean; showAllHorizontal: boolean; sortMode: 'chrono' | 'value'; compareMode: 'none' | 'mom'
  }>({ metrics: ['revenue'], chartType: 'line', showLabels: false, showDots: false, normalize: false, showAllHorizontal: false, sortMode: 'chrono', compareMode: 'none' })

  const [filterYears,      setFilterYears]      = useState<number[]>([])
  const [filterMonths,     setFilterMonths]     = useState<number[]>([])
  const [filterStores,     setFilterStores]     = useState<string[]>([])
  const [filterSearch,     setFilterSearch]     = useState('')
  const [filterRevenueMin, setFilterRevenueMin] = useState('')
  const [filterRevenueMax, setFilterRevenueMax] = useState('')
  const [filterGrossMin,   setFilterGrossMin]   = useState('')
  const [filterGrossMax,   setFilterGrossMax]   = useState('')
  const [filterMarginMin,  setFilterMarginMin]  = useState('')
  const [filterMarginMax,  setFilterMarginMax]  = useState('')
  const [filterAvgCheckMin,setFilterAvgCheckMin]= useState('')
  const [filterAvgCheckMax,setFilterAvgCheckMax]= useState('')
  const [filterChecksMin,  setFilterChecksMin]  = useState('')
  const [filterChecksMax,  setFilterChecksMax]  = useState('')
  const [filterQuantityMin,setFilterQuantityMin]= useState('')
  const [filterQuantityMax,setFilterQuantityMax]= useState('')
  const [sortBy,  setSortBy]  = useState('year')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const ALL_COLUMNS = [
    { key: 'year',        label: t('table_year') },
    { key: 'month',       label: t('table_month') },
    { key: 'store',       label: t('table_store') },
    { key: 'revenue',     label: t('metric_revenue') },
    { key: 'grossProfit', label: t('metric_gross') },
    { key: 'margin',      label: t('metric_margin') },
    { key: 'avgCheck',    label: t('metric_avg_check') },
    { key: 'quantity',    label: t('metric_quantity') },
    { key: 'checks',      label: t('metric_checks') },
  ]
  const activeRangeFilters = new Set<string>()
  if (filterRevenueMin  || filterRevenueMax)  activeRangeFilters.add('revenue')
  if (filterGrossMin    || filterGrossMax)    activeRangeFilters.add('grossProfit')
  if (filterMarginMin   || filterMarginMax)   activeRangeFilters.add('margin')
  if (filterAvgCheckMin || filterAvgCheckMax) activeRangeFilters.add('avgCheck')
  if (filterChecksMin   || filterChecksMax)   activeRangeFilters.add('checks')
  if (filterQuantityMin || filterQuantityMax) activeRangeFilters.add('quantity')
  const visibleColumns = activeRangeFilters.size > 0
    ? ALL_COLUMNS.filter(c => ['year','month','store'].includes(c.key) || activeRangeFilters.has(c.key))
    : ALL_COLUMNS

  const resetFilters = () => {
    setFilterYears([]); setFilterMonths([]); setFilterStores([]); setFilterSearch('')
    setFilterRevenueMin(''); setFilterRevenueMax(''); setFilterGrossMin(''); setFilterGrossMax('')
    setFilterMarginMin(''); setFilterMarginMax(''); setFilterAvgCheckMin(''); setFilterAvgCheckMax('')
    setFilterChecksMin(''); setFilterChecksMax(''); setFilterQuantityMin(''); setFilterQuantityMax('')
    setPage(1)
  }

  const activeFilterCount = [
    filterYears.length, filterMonths.length, filterStores.length, filterSearch,
    filterRevenueMin, filterRevenueMax, filterGrossMin, filterGrossMax,
    filterMarginMin, filterMarginMax, filterAvgCheckMin, filterAvgCheckMax,
    filterChecksMin, filterChecksMax, filterQuantityMin, filterQuantityMax
  ].filter(Boolean).length

  const fetchAll = useCallback(async () => {
    try {
      const params: any = {}
      if (selectedYear)  params.year  = selectedYear
      if (selectedStore) params.store = selectedStore
      const [kpiR, trendR, storeR, yearR, yearsR, mappingR, storesR] = await Promise.all([
        axios.get(`${API}/sales/kpi`,      { params }),
        axios.get(`${API}/sales/trend`,    { params }),
        axios.get(`${API}/sales/by-store`, { params }),
        axios.get(`${API}/sales/by-year`,  { params }),
        axios.get(`${API}/sales/years`),
        axios.get(`${API}/mapping`),
        axios.get(`${API}/sales/stores`),
      ])
      setKpi(kpiR.data); setTrend(trendR.data); setByStore(storeR.data)
      setYearTrend(yearR.data); setYears(yearsR.data); setAllStores(storesR.data)
      setHasMappings(mappingR.data.length > 0)
      const sample = trendR.data[0] || {}
      const dynamicKeys = Object.keys(sample).filter(k => !EXCLUDED_FROM_EXTRA.has(k))
      setExtraFields(dynamicKeys.map((k, i) => ({ key: k, name: k, color: COLORS[i % COLORS.length] })))
    } catch { console.error('fetch error') }
  }, [selectedYear, selectedStore])

  const fetchTable = useCallback(async () => {
    try {
      const params: any = { page, limit: 15, sortBy, sortDir }
      if (selectedStore)         params.stores         = selectedStore
      if (filterSearch)          params.search         = filterSearch
      if (filterYears.length)    params.years          = filterYears.join(',')
      if (filterMonths.length)   params.months         = filterMonths.join(',')
      if (filterStores.length)   params.stores         = filterStores.join(',')
      if (filterRevenueMin)      params.revenueMin     = filterRevenueMin
      if (filterRevenueMax)      params.revenueMax     = filterRevenueMax
      if (filterGrossMin)        params.grossProfitMin = filterGrossMin
      if (filterGrossMax)        params.grossProfitMax = filterGrossMax
      if (filterMarginMin)       params.marginMin      = filterMarginMin
      if (filterMarginMax)       params.marginMax      = filterMarginMax
      if (filterAvgCheckMin)     params.avgCheckMin    = filterAvgCheckMin
      if (filterAvgCheckMax)     params.avgCheckMax    = filterAvgCheckMax
      if (filterChecksMin)       params.checksMin      = filterChecksMin
      if (filterChecksMax)       params.checksMax      = filterChecksMax
      if (filterQuantityMin)     params.quantityMin    = filterQuantityMin
      if (filterQuantityMax)     params.quantityMax    = filterQuantityMax
      const res = await axios.get(`${API}/sales/table`, { params })
      setTable(res.data.data); setTotal(res.data.total)
    } catch { console.error('table error') }
  }, [page, sortBy, sortDir, selectedStore, filterSearch, filterYears, filterMonths, filterStores,
      filterRevenueMin, filterRevenueMax, filterGrossMin, filterGrossMax,
      filterMarginMin, filterMarginMax, filterAvgCheckMin, filterAvgCheckMax,
      filterChecksMin, filterChecksMax, filterQuantityMin, filterQuantityMax])

  const fetchStoreTrend = useCallback(async () => {
    try {
      const params: any = {}
      if (selectedYear) params.year = selectedYear
      // НЕ передаём stores — грузим все, фильтруем на фронте
      const res = await axios.get(`${API}/sales/by-store-trend`, { params })
      setStoreTrend(res.data)
    } catch { console.error('store trend error') }
  }, [selectedYear])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchTable() }, [fetchTable])
  useEffect(() => { if (activeTab === 'stores') fetchStoreTrend() }, [fetchStoreTrend, activeTab])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await axios.post(`${API}/sync`)
      await fetchAll(); await fetchTable()
      setSyncResult(res.data)
    } catch (e: any) { alert('Error: ' + (e.response?.data?.error || e.message)) }
    setSyncing(false)
  }

  const trendWithCalc = trend.map(r => ({
    ...r,
    avgCheck: r.checks > 0 ? Math.round(r.revenue / r.checks) : 0,
    margin: r.revenue > 0 ? parseFloat(((r.grossProfit / r.revenue) * 100).toFixed(2)) : 0,
    avgQuantityPerStore: r.avgQuantityPerStore ?? 0,
    avgPrice: r.quantity > 0 ? Math.round(r.revenue / r.quantity) : 0,
  }))

  const yearLabel = selectedYear ? `_${selectedYear}` : ''

  const downloadOverview = () => xlsxDownloadMulti([
    { name: t('metric_revenue'),     rows: trendWithCalc.map(r => ({ [t('cmp_period')]: r.label, [t('metric_revenue_mdl')]: r.revenue })) },
    { name: t('metric_quantity'),    rows: trendWithCalc.map(r => ({ [t('cmp_period')]: r.label, [t('metric_quantity')]: r.quantity })) },
    { name: t('metric_checks'),      rows: trendWithCalc.map(r => ({ [t('cmp_period')]: r.label, [t('metric_checks')]: r.checks })) },
    { name: t('kpi_avg_check'),      rows: trendWithCalc.map(r => ({ [t('cmp_period')]: r.label, [t('metric_avg_check_mdl')]: r.avgCheck })) },
    { name: t('chart_gross_margin'), rows: trendWithCalc.map(r => ({ [t('cmp_period')]: r.label, [t('metric_gross_mdl')]: r.grossProfit, [t('metric_margin')]: r.margin })) },
    { name: t('chart_by_year'),      rows: yearTrend.map(r => ({ [t('table_year')]: r.year, [t('metric_revenue_mdl')]: r.revenue, [t('metric_gross_mdl')]: r.grossProfit, [t('metric_quantity')]: r.quantity })) },
    ...(extraFields.length > 0 ? [{ name: t('chart_other'), rows: trendWithCalc.map(r => { const obj: any = { [t('cmp_period')]: r.label }; extraFields.forEach(f => { obj[f.name] = r[f.key] ?? 0 }); return obj }) }] : [])
  ], `Дашборд_Тренды${yearLabel}`)

  const downloadBreakdown = () => xlsxDownloadMulti([
    { name: t('chart_store_pie'), rows: byStore.map(r => ({ [t('table_store')]: r.store, [t('metric_revenue_mdl')]: r.revenue })) },
    { name: t('chart_top_stores'), rows: [...byStore].sort((a,b) => b.revenue - a.revenue).map((r, i) => ({ '#': i+1, [t('table_store')]: r.store, [t('metric_revenue_mdl')]: r.revenue })) }
  ], `Дашборд_Разбивка${yearLabel}`)

  const downloadTable = () => xlsxDownload(
    table.map(row => {
      const margin = row.revenue > 0 ? parseFloat(((row.grossProfit / row.revenue) * 100).toFixed(2)) : 0
      const avgCheck = row.checks > 0 ? Math.round(row.revenue / row.checks) : 0
      const obj: any = {
        [t('table_year')]: row.year, [t('table_month')]: MONTHS_FULL[row.month - 1], [t('table_store')]: row.store,
        [t('metric_revenue_mdl')]: row.revenue, [t('metric_gross_mdl')]: row.grossProfit ?? 0,
        [t('metric_margin')]: margin, [t('metric_avg_check_mdl')]: avgCheck,
        [t('metric_quantity')]: row.quantity ?? 0, [t('metric_checks')]: row.checks ?? 0,
      }
      extraFields.forEach(f => { obj[f.name] = row.extraData?.[f.key] ?? row[f.key] ?? '' })
      return obj
    }), `Дашборд_Таблица${yearLabel}`, 'Данные'
  )

  const kpiCards = kpi ? [
    { label: t('kpi_revenue'),       value: fmt(kpi.totalRevenue ?? 0),       color: 'text-blue-400' },
    { label: t('kpi_quantity'), value: fmtNum(kpi.totalQuantity ?? 0), color: 'text-purple-400' },
    { label: t('kpi_checks'),  value: fmtNum(kpi.totalChecks ?? 0),   color: 'text-cyan-400' },
    { label: t('kpi_avg_check'), value: fmtNum(kpi.avgCheck ?? 0) + ' MDL', color: 'text-yellow-400' },
    { label: t('kpi_avg_price'), value: fmtNum(kpi.avgPrice ?? 0) + ' MDL', color: 'text-orange-400' },
    { label: t('kpi_gross_profit'), value: fmt(kpi.totalGrossProfit ?? 0),   color: 'text-green-400' },
    { label: t('kpi_margin'), value: fmtPct(kpi.totalRevenue > 0 ? (kpi.totalGrossProfit / kpi.totalRevenue) * 100 : 0), color: 'text-pink-400' },
  ] : []

  const tabDownloadMap: Record<string, () => void> = { overview: downloadOverview, breakdown: downloadBreakdown, table: downloadTable }

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[color:var(--text-primary)]">
      <Navbar active="dashboard" userRole={user?.role} rightSlot={
        <>
          <select value={selectedStore} onChange={e => { setSelectedStore(e.target.value); setPage(1) }}
            className={`text-[color:var(--text-primary)] text-sm px-3 py-1.5 rounded-lg border transition ${selectedStore ? 'bg-blue-700 border-blue-500' : 'bg-[var(--bg-input)] border-[var(--border)]'}`}>
            <option value="">{t('filter_all_stores')}</option>
            {allStores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setPage(1) }}
            style={{ background: 'var(--bg-input)' }} className="text-[color:var(--text-primary)] text-sm px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <option value="">{t('filter_all_years')}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleSync} disabled={syncing}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition">
            {syncing ? t('action_syncing') : t('action_sync')}
          </button>
          <span className="text-[color:var(--text-muted)] text-sm">{user?.name}</span>
          <button onClick={handleLogout} style={{ background: 'var(--bg-input)' }} className="hover:bg-[var(--bg-hover)] px-3 py-1.5 rounded-lg text-sm transition">{t('action_logout')}</button>
        </>
      } />
      {syncResult && <SyncNotification result={syncResult} onClose={() => setSyncResult(null)} />}

      <div className="p-6 space-y-6">
        {!hasMappings && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-400 text-sm">
            {t('map_not_set')} <a href="/mapping/settings" className="underline font-medium">{t('map_setup')}</a> {t('map_sync')}
          </div>
        )}

        {kpi && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {kpiCards.map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-4 border border-[var(--border)]">
                <p className="text-[color:var(--text-muted)] text-xs">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[{ id: 'overview', label: t('tab_trends') }, { id: 'breakdown', label: t('tab_breakdown') }, { id: 'stores', label: t('tab_stores') }, { id: 'table', label: t('tab_table') }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? 'bg-blue-600' : 'bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={() => tabDownloadMap[activeTab]?.()}
            style={{ background: 'var(--bg-card)' }} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-green-700 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition text-sm border border-[var(--border)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            {t('action_download_all')}
          </button>
        </div>

        {/* Тренды */}
        {activeTab === 'overview' && (
          <div className="space-y-8">

            {/* ─── Гибкий график (постоянный, вверху) ─── */}
            {(() => {
              const cfg = flexChart
              const updateCfg = (patch: Partial<typeof cfg>) => setFlexChart(prev => ({ ...prev, ...patch }))
              const showLabels = cfg.showLabels
              const showDots   = cfg.showDots
              const normalize  = cfg.normalize
              const activeMetrics = FLEX_METRICS_T.filter(m => cfg.metrics.includes(m.key))

              // Разбиваем метрики на группы по осям:
              // Левая ось: MDL (revenue, grossProfit, avgCheck)
              // Правая ось: штуки (quantity, checks) и % (margin)
              const leftMetrics  = activeMetrics.filter(m => !m.isSecondary && !m.isPercent)
              const rightMetrics = activeMetrics.filter(m => m.isSecondary || m.isPercent)
              const hasDual = !normalize && leftMetrics.length > 0 && rightMetrics.length > 0

              const sortedData = cfg.sortMode === 'value'
                ? [...trendWithCalc].sort((a, b) => (b[cfg.metrics[0]] ?? 0) - (a[cfg.metrics[0]] ?? 0))
                : trendWithCalc

              // Период к периоду — вычисляем изменения
              const buildCompareData = () => {
                const base = sortedData
                return base.map((row, i) => {
                  if (i === 0) return null // нет предыдущего периода
                  const prev = base[i - 1]
                  const obj: any = { label: row.label }
                  FLEX_METRICS.forEach(m => {
                    const cur = row[m.key] ?? 0
                    const prv = prev[m.key] ?? 0
                    obj[m.key + '_cur'] = cur
                    obj[m.key + '_prev'] = prv
                    obj[m.key + '_abs'] = cur - prv
                    obj[m.key + '_pct'] = prv !== 0 ? parseFloat(((cur - prv) / Math.abs(prv) * 100).toFixed(1)) : 0
                    obj[m.key] = cur - prv // для графика — абсолютное изменение
                  })
                  obj._prevLabel = prev.label
                  return obj
                }).filter(Boolean)
              }

              const compareData = cfg.compareMode !== 'none' ? buildCompareData() : []

              const normalizeData = (data: any[]) => {
                if (!normalize) return data
                return data.map(row => {
                  const obj: any = { ...row }
                  activeMetrics.forEach(m => {
                    const vals = data.map(r => r[m.key] ?? 0)
                    const max = Math.max(...vals)
                    obj[`__norm_${m.key}`] = max > 0 ? ((row[m.key] ?? 0) / max) * 100 : 0
                  })
                  return obj
                })
              }
              const normKey = (k: string) => normalize ? `__norm_${k}` : k
              const getAxis = (m: typeof FLEX_METRICS[0]) => {
                if (normalize) return 'left'
                return (m.isSecondary || m.isPercent) ? 'right' : 'left'
              }
              const chartData = normalizeData(sortedData)
              const yFmt = normalize ? (v: any) => `${Number(v).toFixed(0)} %` : (v: any) => fmtShort(v)
              const yFmtRight = (v: any) => {
                const hasPercent = rightMetrics.some(m => m.isPercent)
                const hasSecondary = rightMetrics.some(m => m.isSecondary)
                if (hasPercent && !hasSecondary) return `${Number(v).toFixed(1)} %`
                return fmtShort(v)
              }
              const xInterval = Math.floor(trendWithCalc.length / 10)

              const tooltipContent = ({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null
                return (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ color: 'var(--text-primary)', fontSize: 13, marginBottom: 6 }}>{label}</p>
                    {payload.map((entry: any) => {
                      const rawKey = entry.dataKey?.replace('__norm_', '')
                      const met = FLEX_METRICS_T.find(x => x.key === rawKey)
                      const realVal = normalize ? entry.payload[rawKey] : entry.value
                      const formatted = met?.isPercent
                        ? `${Number(realVal).toFixed(1).replace('.', ',')} %`
                        : met?.isSecondary
                          ? fmtNum(Number(realVal))
                          : fmt(Number(realVal))
                      return (
                        <p key={entry.dataKey} style={{ color: entry.color, fontSize: 13, margin: '2px 0' }}>
                          {entry.name}: <strong>{formatted}</strong>
                          {normalize && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> ({Number(entry.value).toFixed(0)} %)</span>}
                        </p>
                      )
                    })}
                  </div>
                )
              }

              const renderLines = () => activeMetrics.map(m => (
                <Line key={m.key} yAxisId={getAxis(m)} type="monotone" dataKey={normKey(m.key)} name={m.name} stroke={m.color} strokeWidth={2.5}
                  dot={showDots ? { stroke: m.color, strokeWidth: 2, r: 4 } : false}>
                  {showLabels && <LabelList dataKey={normalize ? m.key : normKey(m.key)} position="top"
                    formatter={(v: any) => m.isPercent ? `${Number(v).toFixed(1)}%` : m.isSecondary ? fmtNum(Number(v)) : fmtShort(Number(v))}
                    style={{ fontSize: 11, fill: m.color }} />}
                </Line>
              ))

              const renderFlexChart = () => {
                // Линейный
                if (cfg.chartType === 'line') {
                  const lineData = cfg.sortMode === 'value'
                    ? [...chartData].sort((a, b) => (b[normKey(cfg.metrics[0])] || 0) - (a[normKey(cfg.metrics[0])] || 0))
                    : chartData
                  return (
                    <ResponsiveContainer width="100%" height={340}>
                      <LineChart data={lineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: cfg.sortMode === 'value' ? 10 : 12 }} interval={cfg.sortMode === 'value' ? 0 : xInterval} angle={cfg.sortMode === 'value' ? -35 : 0} textAnchor={cfg.sortMode === 'value' ? 'end' : 'middle'} height={cfg.sortMode === 'value' ? 60 : 30} />
                        <YAxis yAxisId="left" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
                        {hasDual && <YAxis yAxisId="right" orientation="right" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmtRight} />}
                        <Tooltip content={tooltipContent} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        {renderLines()}
                      </LineChart>
                    </ResponsiveContainer>
                  )
                }

                // Вертикальные столбцы
                if (cfg.chartType === 'bar') {
                  if (cfg.sortMode === 'value') {
                    // Каждая метрика сортируется независимо — индекс по оси X
                    const sortedByMetric: Record<string, any[]> = {}
                    activeMetrics.forEach(m => {
                      sortedByMetric[m.key] = [...trendWithCalc]
                        .sort((a, b) => (b[m.key] ?? 0) - (a[m.key] ?? 0))
                    })
                    const valueData = Array.from({ length: trendWithCalc.length }, (_, i) => {
                      const obj: any = { idx: i + 1 }
                      activeMetrics.forEach(m => {
                        obj[m.key] = sortedByMetric[m.key][i]?.[m.key] ?? 0
                      })
                      return obj
                    })
                    return (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={valueData} margin={{ top: showLabels ? 24 : 4, right: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis dataKey="idx" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="left" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmt} />
                          {hasDual && <YAxis yAxisId="right" orientation="right" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmtRight} />}
                          <Tooltip content={({ active, payload, label }: any) => {
                            if (!active || !payload?.length) return null
                            return (
                              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>#{label}</p>
                                {payload.map((entry: any) => {
                                  const met = FLEX_METRICS_T.find(x => x.key === entry.dataKey)
                                  const formatted = met?.isPercent
                                    ? `${Number(entry.value).toFixed(1).replace('.', ',')} %`
                                    : met?.isSecondary ? fmtNum(Number(entry.value)) : fmt(Number(entry.value))
                                  const periodLabel = sortedByMetric[entry.dataKey]?.[label - 1]?.label || ''
                                  return (
                                    <p key={entry.dataKey} style={{ color: entry.color, fontSize: 13, margin: '2px 0' }}>
                                      {entry.name}: <strong>{formatted}</strong>
                                      <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> ({periodLabel})</span>
                                    </p>
                                  )
                                })}
                              </div>
                            )
                          }} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          {activeMetrics.map(m => (
                            <Bar key={m.key} yAxisId={getAxis(m)} dataKey={m.key} name={m.name} fill={m.color} radius={[5,5,0,0]}>
                              {showLabels && <LabelList dataKey={m.key} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
                            </Bar>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                  return (
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={chartData} margin={{ top: showLabels ? 24 : 4, right: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} interval={xInterval} />
                        <YAxis yAxisId="left" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
                        {hasDual && <YAxis yAxisId="right" orientation="right" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmtRight} />}
                        <Tooltip content={tooltipContent} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        {activeMetrics.map(m => (
                          <Bar key={m.key} yAxisId={getAxis(m)} dataKey={normKey(m.key)} name={m.name} fill={m.color} radius={[5,5,0,0]}>
                            {showLabels && <LabelList dataKey={normKey(m.key)} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }

                // Горизонтальные столбцы
                if (cfg.chartType === 'bar-horizontal') {
                  if (cfg.sortMode === 'value') {
                    const sortedByMetric: Record<string, any[]> = {}
                    activeMetrics.forEach(m => {
                      sortedByMetric[m.key] = [...trendWithCalc]
                        .sort((a, b) => (b[m.key] ?? 0) - (a[m.key] ?? 0))
                    })
                    const valueData = Array.from({ length: trendWithCalc.length }, (_, i) => {
                      const obj: any = { idx: i + 1 }
                      activeMetrics.forEach(m => {
                        obj[m.key] = sortedByMetric[m.key][i]?.[m.key] ?? 0
                      })
                      return obj
                    })
                    const displayed = cfg.showAllHorizontal ? valueData : valueData.slice(0, 10)
                    return (
                      <>
                        <ResponsiveContainer width="100%" height={100 + displayed.length * 45}>
                          <BarChart data={displayed} layout="vertical" barCategoryGap={8} margin={{ right: showLabels ? 60 : 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                            <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmt} />
                            <YAxis type="category" dataKey="idx" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} width={30} interval={0} />
                            <Tooltip content={({ active, payload, label }: any) => {
                              if (!active || !payload?.length) return null
                              return (
                                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>#{label}</p>
                                  {payload.map((entry: any) => {
                                    const met = FLEX_METRICS_T.find(x => x.key === entry.dataKey)
                                    const formatted = met?.isPercent
                                      ? `${Number(entry.value).toFixed(1).replace('.', ',')} %`
                                      : met?.isSecondary ? fmtNum(Number(entry.value)) : fmt(Number(entry.value))
                                    const periodLabel = sortedByMetric[entry.dataKey]?.[label - 1]?.label || ''
                                    return (
                                      <p key={entry.dataKey} style={{ color: entry.color, fontSize: 13, margin: '2px 0' }}>
                                        {entry.name}: <strong>{formatted}</strong>
                                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> ({periodLabel})</span>
                                      </p>
                                    )
                                  })}
                                </div>
                              )
                            }} />
                            <Legend wrapperStyle={{ fontSize: 13 }} />
                            {activeMetrics.map(m => (
                              <Bar key={m.key} dataKey={m.key} name={m.name} fill={m.color} radius={[0,6,6,0]}>
                                {showLabels && <LabelList dataKey={m.key} position="right" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
                              </Bar>
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                        {valueData.length > 10 && (
                          <div className="flex justify-center mt-2">
                            <button onClick={() => updateCfg({ showAllHorizontal: !cfg.showAllHorizontal })}
                              style={{ background: 'var(--bg-input)' }} className="px-4 py-1.5 rounded-lg text-sm hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] transition">
                              {cfg.showAllHorizontal ? t('ctrl_collapse') : `${t('ctrl_show_all')} (${valueData.length})`}
                            </button>
                          </div>
                        )}
                      </>
                    )
                  }
                  const sorted = chartData
                  const displayed = cfg.showAllHorizontal ? sorted : sorted.slice(0, 10)
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={100 + displayed.length * 45}>
                        <BarChart data={displayed} layout="vertical" barCategoryGap={8} margin={{ right: showLabels ? 60 : 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={yFmt} domain={normalize ? [0,100] : undefined} />
                          <YAxis type="category" dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} width={80} interval={0} />
                          <Tooltip content={tooltipContent} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          {activeMetrics.map(m => (
                            <Bar key={m.key} dataKey={normKey(m.key)} name={m.name} fill={m.color} radius={[0,6,6,0]}>
                              {showLabels && <LabelList dataKey={normKey(m.key)} position="right" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
                            </Bar>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                      {sorted.length > 10 && (
                        <div className="flex justify-center mt-2">
                          <button onClick={() => updateCfg({ showAllHorizontal: !cfg.showAllHorizontal })}
                            style={{ background: 'var(--bg-input)' }} className="px-4 py-1.5 rounded-lg text-sm hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] transition">
                            {cfg.showAllHorizontal ? t('ctrl_collapse') : `${t('ctrl_show_all')} (${sorted.length})`}
                          </button>
                        </div>
                      )}
                    </>
                  )
                }

                return null
              }

              const renderCompareChart = () => {
                if (compareData.length === 0) return <p className="text-[color:var(--text-faint)] text-center py-10">{t('cmp_no_data')}</p>
                const xInterval = Math.floor(compareData.length / 10)
                const compareTt = ({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null
                  const row = compareData.find(r => r.label === label)
                  return (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                      <p style={{ color: 'var(--text-primary)', fontSize: 13, marginBottom: 2 }}>{label}</p>
                      <p style={{ color: 'var(--text-faint)', fontSize: 11, marginBottom: 6 }}>vs {row?._prevLabel}</p>
                      {payload.map((entry: any) => {
                        const mKey = entry.dataKey
                        const met = FLEX_METRICS_T.find(x => x.key === mKey)
                        const cur = row?.[mKey + '_cur'] ?? 0
                        const prv = row?.[mKey + '_prev'] ?? 0
                        const abs = row?.[mKey + '_abs'] ?? 0
                        const pct = row?.[mKey + '_pct'] ?? 0
                        const fmtVal = (v: number) => met?.isPercent ? `${v.toFixed(1)} %` : met?.isSecondary ? fmtNum(v) : fmt(v)
                        const sign = abs >= 0 ? '+' : ''
                        return (
                          <p key={mKey} style={{ color: entry.color, fontSize: 12, margin: '3px 0' }}>
                            <strong>{met?.name}</strong>: {fmtVal(cur)}
                            <span style={{ color: abs >= 0 ? '#10b981' : '#ef4444', marginLeft: 6 }}>
                              {sign}{fmtVal(abs)} ({sign}{pct} %)
                            </span>
                            <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> ← {fmtVal(prv)}</span>
                          </p>
                        )
                      })}
                    </div>
                  )
                }
                return (
                  <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={compareData} margin={{ top: showLabels ? 24 : 4, right: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} interval={xInterval} />
                      <YAxis yAxisId="left" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
                      {activeMetrics.some(m => m.isSecondary || m.isPercent) && activeMetrics.some(m => !m.isSecondary && !m.isPercent) && (
                        <YAxis yAxisId="right" orientation="right" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
                      )}
                      <Tooltip content={compareTt} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <ReferenceLine yAxisId="left" y={0} stroke="var(--chart-axis)" strokeWidth={1.5} />
                      {activeMetrics.map(m => (
                        <Bar key={m.key} yAxisId={getAxis(m)} dataKey={m.key} name={m.name} fill={m.color} radius={[4,4,0,0]}>
                          <Cell fill={m.color} />
                          {showLabels && <LabelList dataKey={m.key} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11, fill: m.color }} />}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )
              }

              return (
                <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg mr-2">{t('chart_analytics')}</h3>
                      {cfg.compareMode === 'none' && (
                        <ChartTypeSwitcher value={cfg.chartType} onChange={v => updateCfg({ chartType: v })} t={t} />
                      )}
                      <span className="text-[color:var(--text-faint)] text-xs mx-1">|</span>
                      {FLEX_METRICS_T.map(m => (
                        <button key={m.key}
                          onClick={() => {
                            const has = cfg.metrics.includes(m.key)
                            const next = has ? cfg.metrics.filter(k => k !== m.key) : [...cfg.metrics, m.key]
                            if (next.length > 0) updateCfg({ metrics: next })
                          }}
                          style={{
                            background: cfg.metrics.includes(m.key) ? m.color + '22' : 'var(--bg-input)',
                            color: cfg.metrics.includes(m.key) ? m.color : 'var(--text-secondary)',
                            border: `1px solid ${cfg.metrics.includes(m.key) ? m.color : 'transparent'}`
                          }}
                          className="px-3 py-1.5 rounded text-sm transition">{m.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={showLabels} onChange={() => updateCfg({ showLabels: !showLabels })} className="accent-blue-500 w-4 h-4" />
                        {t('ctrl_values')}
                      </label>
                      {cfg.chartType === 'line' && (
                        <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
                          <input type="checkbox" checked={showDots} onChange={() => updateCfg({ showDots: !showDots })} className="accent-blue-500 w-4 h-4" />
                          {t('ctrl_dots')}
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: normalize ? '#f59e0b' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={normalize} onChange={() => updateCfg({ normalize: !normalize })} className="accent-amber-500 w-4 h-4" />
                        Норм. шкала
                      </label>
                      {cfg.compareMode === 'none' && (
                        <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                          {(['chrono', 'value'] as const).map(mode => (
                            <button key={mode} onClick={() => updateCfg({ sortMode: mode })}
                              className={`px-3 py-1.5 text-xs transition ${cfg.sortMode === mode ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
                              {mode === 'chrono' ? t('ctrl_chrono') : t('ctrl_value_sort')}
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="text-[color:var(--text-faint)] text-xs mx-1">|</span>
                      <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                        {([
                          { id: 'none', label: t('ctrl_normal') },
                          { id: 'mom',  label: t('ctrl_mom') },
                        ] as const).map(m => (
                          <button key={m.id} onClick={() => updateCfg({ compareMode: m.id })}
                            className={`px-3 py-1.5 text-xs transition ${cfg.compareMode === m.id ? 'bg-violet-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <DownloadBtn onClick={() => {
                      const rows = (cfg.compareMode !== 'none' ? compareData : sortedData).map(r => {
                        const obj: any = { [t('cmp_period')]: r.label }
                        activeMetrics.forEach(m => {
                          if (cfg.compareMode !== 'none') {
                            obj[m.name + ` (${t('table_year')})`] = r[m.key + '_cur'] ?? 0
                            obj[m.name + ` (${t('cmp_base_label')})`] = r[m.key + '_prev'] ?? 0
                            obj[m.name + ` (Δ)`] = r[m.key + '_abs'] ?? 0
                            obj[m.name + ` (Δ%)`] = r[m.key + '_pct'] ?? 0
                          } else {
                            obj[m.name] = r[m.key] ?? 0
                          }
                        })
                        return obj
                      })
                      xlsxDownload(rows, `Analytics${yearLabel}`, t('chart_analytics'))
                    }} title={t('action_download')} />
                  </div>
                  {cfg.compareMode !== 'none' ? renderCompareChart() : renderFlexChart()}
                </div>
              )
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SingleMetricChart title={t('chart_revenue')} data={trendWithCalc} dataKey="revenue" xKey="label" color="#3b82f6" formatTooltip={v => fmt(v)} filename={`Выручка${yearLabel}`}
              t={t} />
              <SingleMetricChart title={t('kpi_quantity')} data={trendWithCalc} dataKey="quantity" xKey="label" color="#8b5cf6" formatTooltip={v => fmtNum(v)} filename={`Кол-во_продаж${yearLabel}`}
              t={t} />
            </div>
            <SingleMetricChart title={t('chart_checks')} data={trendWithCalc} dataKey="checks" xKey="label" color="#06b6d4" formatTooltip={v => fmtNum(v)} filename={`Кол-во_чеков${yearLabel}`}
              t={t} />
            <MultiMetricChart title={t('chart_avg_metrics')} data={trendWithCalc} xKey="label"
              dualAxis={!normAvgCheck} normalize={normAvgCheck}
              metrics={[
                { key: 'avgCheck',            name: t('metric_avg_check_mdl'),          color: '#f59e0b' },
                { key: 'avgQuantityPerStore',  name: t('metric_avg_qty_store'),  color: '#8b5cf6', isSecondary: true },
                { key: 'margin',              name: t('metric_margin'),               color: '#ec4899', isPercent: true, isSecondary: true },
              ]}
              extraControls={
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: normAvgCheck ? '#f59e0b' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={normAvgCheck} onChange={() => setNormAvgCheck(v => !v)} className="accent-amber-500 w-4 h-4" />
                  {t('ctrl_norm_scale')}
                </label>
              }
              filename={`Ср_чек_кол-во_маржа${yearLabel}`}
              t={t} />
            <MultiMetricChart title={t('chart_gross_margin')} data={trendWithCalc} xKey="label" dualAxis
              metrics={[
                { key: 'grossProfit', name: t('metric_gross'), color: '#10b981', isPercent: false },
                { key: 'margin',      name: t('metric_margin'),     color: '#ec4899', isPercent: true },
              ]}
              filename={`Валовая_прибыль_и_маржа${yearLabel}`}
              t={t} />
            <MultiMetricChart title={t('chart_by_year')} data={yearTrend} xKey="year"
              metrics={[
                { key: 'revenue',     name: t('metric_revenue_mdl'),      color: '#3b82f6' },
                { key: 'grossProfit', name: t('metric_gross_mdl'), color: '#10b981' },
              ]}
              filename="По_годам"
              t={t} />
            <MultiMetricChart title={t('chart_other')} data={trendWithCalc} xKey="label" metrics={extraFields}
              emptyMessage={t('no_data_extra')}
              filename={`Остальное${yearLabel}`}
              t={t} />


          </div>
        )}

        {/* Разбивка */}
        {activeTab === 'breakdown' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-[var(--border)]">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-semibold text-lg">{t('chart_store_pie')}</h3>
                <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={showStorePieLabels} onChange={() => setShowStorePieLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
                  {t('ctrl_values')}
                </label>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={byStore} dataKey="revenue" nameKey="store" cx="50%" cy="50%" outerRadius={110}
                    label={showStorePieLabels ? ({ payload, percent }) => `${payload.store} ${((percent ?? 0)*100).toFixed(1).replace('.', ',')} %` : false}>
                    {byStore.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13 }} labelStyle={{ color: 'var(--text-primary)', fontSize: 13 }} itemStyle={{ color: 'var(--text-primary)', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-end mt-3">
                <DownloadBtn onClick={() => xlsxDownload(byStore.map(r => ({ [t('table_store')]: r.store, [t('metric_revenue_mdl')]: r.revenue })), `Доля_выручки_по_магазинам${yearLabel}`, 'Доля по магазинам')} title="Скачать" />
              </div>
            </div>
            <SingleMetricChart title={t('chart_top_stores')} data={byStore} dataKey="revenue" xKey="store" color="#8b5cf6" formatTooltip={v => fmt(v)} filename={`Топ_магазинов${yearLabel}`}
              t={t} />
          </div>
        )}

        {/* По магазинам */}
        {activeTab === 'stores' && (() => {
          const STORE_METRICS = [
            { key: 'revenue',     label: t('metric_revenue'),   fmt: (v: number) => fmt(v) },
            { key: 'grossProfit', label: t('metric_gross'),      fmt: (v: number) => fmt(v) },
            { key: 'margin',      label: t('metric_margin'),     fmt: (v: number) => fmtPct(v) },
            { key: 'avgCheck',    label: t('metric_avg_check'), fmt: (v: number) => fmt(v) },
            { key: 'quantity',    label: t('metric_quantity'),  fmt: (v: number) => fmtNum(v) },
            { key: 'checks',      label: t('metric_checks'),    fmt: (v: number) => fmtNum(v) },
          ]
          const visibleStores = storeTrendSelectedStores.length > 0
            ? storeTrendSelectedStores.filter(s => storeTrend.stores.includes(s))
            : storeTrend.stores

          // Строим данные: каждая точка = период, каждый магазин = отдельный ключ
          const chartData = storeTrend.periods.map(row => {
            const obj: any = { label: row.label }
            visibleStores.forEach(s => {
              obj[s] = row[s]?.[storeTrendMetric] ?? 0
            })
            return obj
          })

          const ttProps = { contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13 }, labelStyle: { color: 'var(--text-primary)', fontSize: 13 }, itemStyle: { color: 'var(--text-primary)', fontSize: 13 } }
          const metFmt = STORE_METRICS.find(m => m.key === storeTrendMetric)?.fmt || fmtNum
          const xInterval = Math.floor(chartData.length / 10)

          const renderStoreChart = () => {
            if (storeTrendType === 'line') return (
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} interval={xInterval} />
                  <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
                  <Tooltip formatter={(v: any) => metFmt(Number(v))} {...ttProps} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {visibleStores.map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} name={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                      dot={storeTrendShowDots ? { stroke: COLORS[i % COLORS.length], strokeWidth: 2, r: 3 } : false}>
                      {storeTrendShowLabels && <LabelList dataKey={s} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 10, fill: COLORS[i % COLORS.length] }} />}
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )
            if (storeTrendType === 'bar-horizontal') {
              // Для горизонтального — суммируем по всем периодам для каждого магазина
              const totalData = visibleStores.map(s => ({
                store: s,
                value: storeTrend.periods.reduce((sum, row) => sum + (row[s]?.[storeTrendMetric] ?? 0), 0)
              })).sort((a, b) => b.value - a.value)
              return (
                <ResponsiveContainer width="100%" height={100 + totalData.length * 45}>
                  <BarChart data={totalData} layout="vertical" barCategoryGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
                    <YAxis type="category" dataKey="store" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} width={80} interval={0} />
                    <Tooltip formatter={(v: any) => metFmt(Number(v))} {...ttProps} />
                    <Bar dataKey="value" name={STORE_METRICS.find(m => m.key === storeTrendMetric)?.label || storeTrendMetric} radius={[0,6,6,0]}>
                      {totalData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      {storeTrendShowLabels && <LabelList dataKey="value" position="right" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 11 }} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            }
            return (
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} interval={xInterval} />
                  <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickFormatter={v => fmtShort(v)} />
                  <Tooltip formatter={(v: any) => metFmt(Number(v))} {...ttProps} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {visibleStores.map((s, i) => (
                    <Bar key={s} dataKey={s} name={s} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]}>
                      {storeTrendShowLabels && <LabelList dataKey={s} position="top" formatter={(v: any) => fmtShort(v)} style={{ fontSize: 10, fill: COLORS[i % COLORS.length] }} />}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )
          }

          return (
            <div className="space-y-6">
              {/* Панель управления */}
              <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-5 border border-[var(--border)]">
                <div className="flex flex-wrap gap-4">
                  {/* Метрика */}
                  <div>
                    <p className="text-xs text-[color:var(--text-muted)] mb-2">{t('stores_indicator')}</p>
                    <div className="flex flex-wrap gap-1">
                      {STORE_METRICS.map(m => (
                        <button key={m.key} onClick={() => setStoreTrendMetric(m.key)}
                          className={`px-3 py-1.5 rounded text-sm transition ${storeTrendMetric === m.key ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Тип графика */}
                  <div>
                    <p className="text-xs text-[color:var(--text-muted)] mb-2">{t('stores_chart_type')}</p>
                    <ChartTypeSwitcher value={storeTrendType} onChange={setStoreTrendType} t={t} />
                  </div>
                                    <div className="flex items-end gap-3">
                    <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
                      <input type="checkbox" checked={storeTrendShowLabels} onChange={() => setStoreTrendShowLabels(v => !v)} className="accent-blue-500 w-4 h-4" />
                      {t('ctrl_values')}
                    </label>
                    {storeTrendType === 'line' && (
                      <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={storeTrendShowDots} onChange={() => setStoreTrendShowDots(v => !v)} className="accent-blue-500 w-4 h-4" />
                        Точки
                      </label>
                    )}
                  </div>
                </div>
                {/* Выбор магазинов */}
                <div className="mt-4">
                  <p className="text-xs text-[color:var(--text-muted)] mb-2">{t('filter_stores')} <span className="text-[color:var(--text-faint)]">({t('stores_all_default')})</span></p>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setStoreTrendSelectedStores([])}
                      className={`px-3 py-1 rounded text-xs transition ${storeTrendSelectedStores.length === 0 ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-muted)]'}`}>
                      Все
                    </button>
                    <span className="text-[color:var(--text-faint)] text-xs mx-1 self-center">|</span>
                    {storeTrend.stores.map((s, i) => {
                      const active = storeTrendSelectedStores.includes(s)
                      return (
                        <button key={s} onClick={() => setStoreTrendSelectedStores(prev =>
                          prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                        )}
                          style={{
                            background: active ? COLORS[i % COLORS.length] + '33' : 'var(--bg-input)',
                            color: active ? COLORS[i % COLORS.length] : 'var(--text-secondary)',
                            border: `1px solid ${active ? COLORS[i % COLORS.length] : 'transparent'}`
                          }}
                          className="px-3 py-1 rounded text-xs transition">
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* График */}
              <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl p-6 border border-[var(--border)]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-lg">
                    {STORE_METRICS.find(m => m.key === storeTrendMetric)?.label} {t('tab_stores')}
                  </h3>
                  <DownloadBtn onClick={() => {
                    const rows = chartData.map(r => {
                      const obj: any = { [t('cmp_period')]: r.label }
                      visibleStores.forEach(s => { obj[s] = r[s] ?? 0 })
                      return obj
                    })
                    xlsxDownload(rows, `По_магазинам_${storeTrendMetric}${yearLabel}`, 'По магазинам')
                  }} title={t('action_download')} />
                </div>
                {storeTrend.periods.length === 0
                  ? <p className="text-[color:var(--text-faint)] text-center py-10">{t('no_data')}</p>
                  : renderStoreChart()
                }
              </div>
            </div>
          )
        })()}

        {/* Таблица */}
        {activeTab === 'table' && (
          <div className="space-y-4">
            <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl border border-[var(--border)]">
              <button onClick={() => setFiltersOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-[var(--bg-hover)]/50 transition rounded-xl">
                <div className="flex items-center gap-3">
                  <span>🔍 {t('filter_filters')}</span>
                  {activeFilterCount > 0 && <span className="bg-blue-600 text-[color:var(--text-primary)] text-xs px-2 py-0.5 rounded-full">{activeFilterCount}</span>}
                </div>
                <span className="text-[color:var(--text-muted)]">{filtersOpen ? '▲' : '▼'}</span>
              </button>
              {filtersOpen && (
                <div className="px-5 pb-5 border-t border-[var(--border)] pt-4 space-y-5">
                  <div>
                    <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('filter_search')}</label>
                    <input type="text" placeholder={t('filter_search')} value={filterSearch}
                      onChange={e => { setFilterSearch(e.target.value); setPage(1) }}
                      style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label className="text-xs text-[color:var(--text-muted)] mb-2 block">{t('table_year')}</label>
                      <div className="flex flex-wrap gap-1">
                        {years.map(y => (
                          <button key={y} onClick={() => { setFilterYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]); setPage(1) }}
                            className={`px-3 py-1 rounded text-sm transition ${filterYears.includes(y) ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-[color:var(--text-muted)] mb-2 block">{t('table_month')}</label>
                      <div className="grid grid-cols-4 gap-1">
                        {MONTHS.map((m, i) => (
                          <button key={i} onClick={() => { setFilterMonths(prev => prev.includes(i+1) ? prev.filter(x => x !== i+1) : [...prev, i+1]); setPage(1) }}
                            className={`px-2 py-1 rounded text-xs transition ${filterMonths.includes(i+1) ? 'bg-blue-600 text-[color:var(--text-primary)]' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)]'}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <label className="text-xs text-[color:var(--text-muted)] mb-2 block">{t('table_store')}</label>
                      <StoreDropdown stores={allStores} selected={filterStores} onChange={s => { setFilterStores(s); setPage(1) }}  t={t}/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                    {[
                      { label: t('kpi_revenue'),       unit: 'MDL', min: filterRevenueMin,  setMin: setFilterRevenueMin,  max: filterRevenueMax,  setMax: setFilterRevenueMax },
                      { label: t('kpi_gross_profit'),  unit: 'MDL', min: filterGrossMin,    setMin: setFilterGrossMin,    max: filterGrossMax,    setMax: setFilterGrossMax },
                      { label: t('kpi_margin'),        unit: '%',   min: filterMarginMin,   setMin: setFilterMarginMin,   max: filterMarginMax,   setMax: setFilterMarginMax },
                      { label: t('kpi_avg_check'),     unit: 'MDL', min: filterAvgCheckMin, setMin: setFilterAvgCheckMin, max: filterAvgCheckMax, setMax: setFilterAvgCheckMax },
                      { label: t('kpi_checks'),        unit: '',    min: filterChecksMin,   setMin: setFilterChecksMin,   max: filterChecksMax,   setMax: setFilterChecksMax },
                      { label: t('kpi_quantity'),      unit: '',    min: filterQuantityMin, setMin: setFilterQuantityMin, max: filterQuantityMax, setMax: setFilterQuantityMax },
                    ].map(f => (
                      <RangeDropdown key={f.label} label={f.label} unit={f.unit}
                        min={f.min} setMin={f.setMin} max={f.max} setMax={f.setMax}
                        onApply={() => setPage(1)} t={t} />
                    ))}
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="flex justify-end">
                      <button onClick={resetFilters}
                        className="text-sm text-red-400 hover:text-red-300 transition px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20">
                        {`✕ ${t('filter_clear')} (${activeFilterCount})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} className="rounded-xl border border-[var(--border)]">
              <div className="p-3 border-b border-[var(--border)] flex justify-between items-center">
                <span className="text-[color:var(--text-muted)] text-sm">{t('table_found')} <span className="text-[color:var(--text-primary)] font-medium">{total}</span></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: 'var(--bg-input)' }} className="/50">
                    <tr>
                      {visibleColumns.map(col => (
                        <SortTh key={col.key} col={col.key} label={col.label} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                      ))}
                      {extraFields.map(f => (
                        <th key={f.key} className="px-4 py-3 text-left text-[color:var(--text-muted)] font-medium whitespace-nowrap">{f.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {table.map((row, i) => {
                      const margin = row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0
                      const avgCheck = row.checks > 0 ? row.revenue / row.checks : 0
                      const cellMap: Record<string, React.ReactNode> = {
                        year:        <td key="year"        className="px-4 py-3 text-[color:var(--text-muted)]">{row.year}</td>,
                        month:       <td key="month"       className="px-4 py-3 text-[color:var(--text-muted)]">{MONTHS[row.month - 1]}</td>,
                        store:       <td key="store"       className="px-4 py-3 text-blue-400 font-medium">{row.store}</td>,
                        revenue:     <td key="revenue"     className="px-4 py-3 text-blue-400">{fmt(row.revenue)}</td>,
                        grossProfit: <td key="grossProfit" className="px-4 py-3 text-green-400">{fmt(row.grossProfit ?? 0)}</td>,
                        margin:      <td key="margin"      className="px-4 py-3 text-pink-400">{fmtPct(margin)}</td>,
                        avgCheck:    <td key="avgCheck"    className="px-4 py-3 text-yellow-400">{fmt(avgCheck)}</td>,
                        quantity:    <td key="quantity"    className="px-4 py-3">{fmtNum(row.quantity ?? 0)}</td>,
                        checks:      <td key="checks"      className="px-4 py-3 text-cyan-400">{fmtNum(row.checks ?? 0)}</td>,
                      }
                      return (
                        <tr key={i} className="hover:bg-[var(--bg-hover)]/30 transition">
                          {visibleColumns.map(col => cellMap[col.key])}
                          {extraFields.map(f => (
                            <td key={f.key} className="px-4 py-3 text-orange-400">
                              {row.extraData?.[f.key] ?? row[f.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                    {table.length === 0 && (
                      <tr><td colSpan={9 + extraFields.length} className="px-4 py-10 text-center text-[color:var(--text-faint)]">Нет данных по выбранным фильтрам</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 flex justify-between items-center border-t border-[var(--border)]">
                <button disabled={page === 1} onClick={() => setPage(p => p-1)}
                  style={{ background: 'var(--bg-input)' }} className="px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-[var(--bg-hover)] transition text-sm">← Назад</button>
                <span className="text-[color:var(--text-muted)] text-sm">{t('table_page')} {page} из {Math.max(1, Math.ceil(total/15))}</span>
                <button disabled={page >= Math.ceil(total/15)} onClick={() => setPage(p => p+1)}
                  style={{ background: 'var(--bg-input)' }} className="px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-[var(--bg-hover)] transition text-sm">Вперёд →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}