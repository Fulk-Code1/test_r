import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'

interface SystemField {
  id: number
  key: string
  label: string
  type: string
  dataType: string
  formula: string | null
}

interface MappingRow {
  systemFieldKey: string
  sourceColumn: string
}

export default function MappingPage() {
  const [systemFields, setSystemFields] = useState<SystemField[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingCols, setLoadingCols] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/mapping/system-fields`),
      axios.get(`${API}/mapping`),
    ]).then(([fieldsRes, mappingRes]) => {
      setSystemFields(fieldsRes.data)
      const existingMappings: any[] = mappingRes.data
      const init = fieldsRes.data
        .filter((f: SystemField) => f.type === 'fact')
        .map((f: SystemField) => {
          const existing = existingMappings.find(m => m.systemField.key === f.key)
          return { systemFieldKey: f.key, sourceColumn: existing?.sourceColumn || '' }
        })
      setMappings(init)
      setLoading(false)
    })
  }, [])

  const loadSourceColumns = async () => {
    setLoadingCols(true)
    try {
      const res = await axios.get(`${API}/mapping/source-columns`)
      setSourceColumns(res.data)
    } catch (e: any) {
      setMessage('Ошибка загрузки колонок: ' + e.message)
    }
    setLoadingCols(false)
  }

  const updateMapping = (systemFieldKey: string, sourceColumn: string) => {
    setMappings(prev => prev.map(m => m.systemFieldKey === systemFieldKey ? { ...m, sourceColumn } : m))
  }

  const addCustomField = () => {
    setMappings(prev => [...prev, { systemFieldKey: '', sourceColumn: '' }])
  }

  const removeCustomField = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index))
  }

  const saveMapping = async () => {
    setSaving(true)
    setMessage('')
    try {
      const validMappings = mappings.filter(m => m.sourceColumn && m.systemFieldKey)
      await axios.post(`${API}/mapping`, { mappings: validMappings })
      setMessage('Маппинг сохранён успешно!')
    } catch (e: any) {
      setMessage('Ошибка: ' + e.message)
    }
    setSaving(false)
  }

  const factFields = systemFields.filter(f => f.type === 'fact')
  const calcFields = systemFields.filter(f => f.type === 'calculated')

  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Загрузка...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <h1 className="text-xl font-bold">Sales Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <a href="/"
            className="px-4 py-2 rounded-lg text-sm font-medium transition bg-gray-700 hover:bg-gray-600">
            📊 Дашборд
          </a>
          <a href="/mapping"
            className="px-4 py-2 rounded-lg text-sm font-medium transition bg-blue-600">
            ⚙️ Маппинг
          </a>
        </div>
      </nav>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">⚙️ Настройка маппинга полей</h2>

        {/* Загрузка колонок из источника */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Колонки из Google Sheets</h3>
            <button onClick={loadSourceColumns} disabled={loadingCols}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition">
              {loadingCols ? 'Загрузка...' : '🔄 Загрузить колонки из источника'}
            </button>
          </div>
          {sourceColumns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sourceColumns.map(col => (
                <span key={col} className="bg-gray-700 px-3 py-1 rounded-full text-sm text-blue-300">{col}</span>
              ))}
            </div>
          )}
        </div>

        {/* Маппинг полей */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="font-semibold mb-4">Маппинг полей источника → системные поля</h3>
          <p className="text-gray-400 text-sm mb-4">Укажите какая колонка из источника соответствует каждому системному полю</p>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 uppercase px-1">
              <span>Системное поле</span>
              <span>Тип</span>
              <span>Колонка в источнике</span>
            </div>

            {mappings.map((m, i) => {
              const sysField = factFields.find(f => f.key === m.systemFieldKey)
              return (
                <div key={i} className="grid grid-cols-3 gap-4 items-center bg-gray-700/50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{sysField?.label || '—'}</span>
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full w-fit">факт</span>
                  <div className="flex gap-2">
                    {sourceColumns.length > 0 ? (
                      <select value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                        className="flex-1 bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-500">
                        <option value="">— не выбрано —</option>
                        {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                        placeholder="Название колонки..."
                        className="flex-1 bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-500 outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                </div>
              )
            })}

            {calcFields.map(field => (
              <div key={field.key} className="grid grid-cols-3 gap-4 items-center bg-gray-700/20 rounded-lg px-3 py-2 border border-dashed border-gray-600">
                <span className="text-sm font-medium text-gray-300">{field.label}</span>
                <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full w-fit">расчёт</span>
                <span className="text-xs text-gray-500 font-mono">{field.formula}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Дополнительные колонки */}
        {sourceColumns.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Дополнительные колонки</h3>
              <button onClick={addCustomField} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">
                + Добавить поле
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">Если в источнике есть новые колонки — добавьте их здесь</p>
            {mappings.filter(m => !factFields.find(f => f.key === m.systemFieldKey)).map((m, i) => (
              <div key={i} className="flex gap-3 mb-2 items-center">
                <select value={m.sourceColumn} onChange={e => {
                  const newMappings = [...mappings]
                  const idx = mappings.indexOf(m)
                  newMappings[idx] = { ...m, sourceColumn: e.target.value }
                  setMappings(newMappings)
                }} className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-600">
                  <option value="">— колонка источника —</option>
                  {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
                <button onClick={() => removeCustomField(mappings.indexOf(m))} className="text-red-400 hover:text-red-300 px-2">✕</button>
              </div>
            ))}
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.includes('Ошибка') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            {message}
          </div>
        )}
        <button onClick={saveMapping} disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 py-3 rounded-xl font-medium transition">
          {saving ? 'Сохранение...' : '💾 Сохранить маппинг'}
        </button>
      </div>
    </div>
  )
}