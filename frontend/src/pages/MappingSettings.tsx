import { useState, useEffect } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'

const API = import.meta.env.VITE_API_URL || '/api'

interface SystemField {
  id: number; key: string; label: string; type: string; dataType: string; formula: string | null; isCustom: boolean
}
interface MappingRow { systemFieldKey: string; sourceColumn: string }
interface NewField { label: string; type: 'fact' | 'calculated'; dataType: string; formula: string; sourceColumn: string }

const emptyNewField = (): NewField => ({ label: '', type: 'fact', dataType: 'number', formula: '', sourceColumn: '' })

export default function MappingSettings() {
  const [systemFields, setSystemFields] = useState<SystemField[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingCols, setLoadingCols] = useState(false)
  const [message, setMessage] = useState('')
  const [showAddField, setShowAddField] = useState(false)
  const [newField, setNewField] = useState<NewField>(emptyNewField())
  const [addingField, setAddingField] = useState(false)

  const loadData = () => Promise.all([
    axios.get(`${API}/mapping/system-fields`),
    axios.get(`${API}/mapping`),
  ]).then(([fieldsRes, mappingRes]) => {
    const fields: SystemField[] = fieldsRes.data
    setSystemFields(fields)
    const existingMappings: any[] = mappingRes.data
    const init = fields
      .filter(f => f.type === 'fact')
      .map(f => {
        const existing = existingMappings.find(m => m.systemField.key === f.key)
        return { systemFieldKey: f.key, sourceColumn: existing?.sourceColumn || '' }
      })
    setMappings(init)
    setLoading(false)
  })

  useEffect(() => { loadData() }, [])

  const loadSourceColumns = async () => {
    setLoadingCols(true)
    try {
      const res = await axios.get(`${API}/mapping/source-columns`)
      setSourceColumns(res.data)
    } catch (e: any) { setMessage('Ошибка загрузки колонок: ' + e.message) }
    setLoadingCols(false)
  }

  const updateMapping = (systemFieldKey: string, sourceColumn: string) => {
    setMappings(prev => prev.map(m => m.systemFieldKey === systemFieldKey ? { ...m, sourceColumn } : m))
  }

  const saveMapping = async () => {
    setSaving(true); setMessage('')
    try {
      const validMappings = mappings.filter(m => m.sourceColumn && m.systemFieldKey)
      await axios.post(`${API}/mapping`, { mappings: validMappings })
      setMessage('Маппинг сохранён успешно!')
    } catch (e: any) { setMessage('Ошибка: ' + e.message) }
    setSaving(false)
  }

  const addCustomField = async () => {
    if (!newField.label) return setMessage('Укажите название поля')
    if (newField.type === 'calculated' && !newField.formula) return setMessage('Укажите формулу')
    if (newField.type === 'fact' && !newField.sourceColumn) return setMessage('Укажите колонку источника')
    setAddingField(true); setMessage('')
    try {
      const fieldRes = await axios.post(`${API}/mapping/custom-field`, {
        label: newField.label, type: newField.type, dataType: newField.dataType, formula: newField.formula || null
      })
      // Если факт — сразу сохраняем маппинг
      if (newField.type === 'fact' && newField.sourceColumn) {
        const currentMappings = mappings.filter(m => m.sourceColumn && m.systemFieldKey)
        await axios.post(`${API}/mapping`, {
          mappings: [...currentMappings, { sourceColumn: newField.sourceColumn, systemFieldKey: fieldRes.data.key }]
        })
      }
      setNewField(emptyNewField())
      setShowAddField(false)
      await loadData()
      setMessage('Поле добавлено!')
    } catch (e: any) { setMessage('Ошибка: ' + e.message) }
    setAddingField(false)
  }

  const deleteCustomField = async (key: string) => {
    if (!confirm('Удалить поле?')) return
    try {
      await axios.delete(`${API}/mapping/custom-field/${key}`)
      await loadData()
      setMessage('Поле удалено')
    } catch (e: any) { setMessage('Ошибка: ' + e.message) }
  }

  const factFields = systemFields.filter(f => f.type === 'fact')
  const calcFields = systemFields.filter(f => f.type === 'calculated')
  const allFieldKeys = systemFields.map(f => f.key)

  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Загрузка...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar active="settings" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">⚙️ Настройка маппинга полей</h2>

        {/* Колонки источника */}
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

        {/* Таблица маппинга */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Маппинг полей источника → системные поля</h3>
            <button onClick={() => setShowAddField(v => !v)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm transition">
              {showAddField ? '✕ Отмена' : '+ Новое поле'}
            </button>
          </div>
          <p className="text-gray-400 text-sm mb-4">Укажите какая колонка из источника соответствует каждому системному полю</p>

          {showAddField && (
          <div className="bg-gray-700/30 rounded-xl p-4 border border-blue-500/30 mb-4">
            <h3 className="font-semibold mb-4 text-sm">➕ Новое поле</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Название поля</label>
                  <input type="text" value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    placeholder="Например: Себестоимость"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тип поля</label>
                  <select value={newField.type} onChange={e => setNewField(p => ({ ...p, type: e.target.value as 'fact' | 'calculated' }))}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                    <option value="fact">Факт (из источника)</option>
                    <option value="calculated">Расчётное (формула)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тип данных</label>
                  <select value={newField.dataType} onChange={e => setNewField(p => ({ ...p, dataType: e.target.value }))}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                    <option value="number">Число (дробное)</option>
                    <option value="integer">Целое число</option>
                    <option value="percent">Процент</option>
                  </select>
                </div>
                {newField.type === 'fact' ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Колонка в источнике</label>
                    {sourceColumns.length > 0 ? (
                      <select value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                        <option value="">— выберите колонку —</option>
                        {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        placeholder="Название колонки..."
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Формула</label>
                    <input type="text" value={newField.formula} onChange={e => setNewField(p => ({ ...p, formula: e.target.value }))}
                      placeholder="Например: revenue * 0.3"
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                )}
              </div>
              {newField.type === 'calculated' && (
                <div className="bg-gray-700/30 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Доступные поля для формулы:</p>
                  <div className="flex flex-wrap gap-1">
                    {allFieldKeys.map(k => (
                      <span key={k} className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono text-blue-300">{k}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={addCustomField} disabled={addingField}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
                {addingField ? 'Добавление...' : '✓ Добавить поле'}
              </button>
            </div>
          </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 uppercase px-1">
              <span>Системное поле</span><span>Тип</span><span>Колонка в источнике</span>
            </div>

            {/* Фактические поля */}
            {mappings.map((m, i) => {
              const sysField = factFields.find(f => f.key === m.systemFieldKey)
              if (!sysField) return null
              return (
                <div key={i} className="grid grid-cols-3 gap-4 items-center bg-gray-700/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{sysField.label}</span>
                    {sysField.isCustom && (
                      <button onClick={() => deleteCustomField(sysField.key)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    )}
                  </div>
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full w-fit">факт</span>
                  {sourceColumns.length > 0 ? (
                    <select value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                      className="bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-500">
                      <option value="">— не выбрано —</option>
                      {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                      placeholder="Название колонки..."
                      className="bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-500 outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>
              )
            })}

            {/* Расчётные поля */}
            {calcFields.map(field => (
              <div key={field.key} className="grid grid-cols-3 gap-4 items-center bg-gray-700/20 rounded-lg px-3 py-2 border border-dashed border-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-300">{field.label}</span>
                  {field.isCustom && (
                    <button onClick={() => deleteCustomField(field.key)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  )}
                </div>
                <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full w-fit">расчёт</span>
                <span className="text-xs text-gray-500 font-mono">{field.formula}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Форма добавления нового поля */}
        {showAddField && (
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-500/30">
            <h3 className="font-semibold mb-4">➕ Новое поле</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Название поля</label>
                  <input type="text" value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    placeholder="Например: Себестоимость"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тип поля</label>
                  <select value={newField.type} onChange={e => setNewField(p => ({ ...p, type: e.target.value as 'fact' | 'calculated' }))}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                    <option value="fact">Факт (из источника)</option>
                    <option value="calculated">Расчётное (формула)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тип данных</label>
                  <select value={newField.dataType} onChange={e => setNewField(p => ({ ...p, dataType: e.target.value }))}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                    <option value="number">Число (дробное)</option>
                    <option value="integer">Целое число</option>
                    <option value="percent">Процент</option>
                  </select>
                </div>
                {newField.type === 'fact' ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Колонка в источнике</label>
                    {sourceColumns.length > 0 ? (
                      <select value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600">
                        <option value="">— выберите колонку —</option>
                        {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        placeholder="Название колонки..."
                        className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Формула</label>
                    <input type="text" value={newField.formula} onChange={e => setNewField(p => ({ ...p, formula: e.target.value }))}
                      placeholder="Например: revenue * 0.3"
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                )}
              </div>

              {newField.type === 'calculated' && (
                <div className="bg-gray-700/30 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Доступные поля для формулы:</p>
                  <div className="flex flex-wrap gap-1">
                    {allFieldKeys.filter(k => !k.startsWith('custom_') || systemFields.find(f => f.key === k)?.type === 'fact').map(k => (
                      <span key={k} className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono text-blue-300">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={addCustomField} disabled={addingField}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
                {addingField ? 'Добавление...' : '✓ Добавить поле'}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.includes('Ошибка') || message.includes('Укажите') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            {message}
            {message.includes('успешно') && (
              <a href="/mapping" className="ml-3 underline font-medium">Перейти в Маппинг →</a>
            )}
          </div>
        )}

        <button onClick={saveMapping} disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 py-3 rounded-xl font-medium transition">
          {saving ? 'Сохранение...' : 'Сохранить маппинг'}
        </button>
      </div>
    </div>
  )
}