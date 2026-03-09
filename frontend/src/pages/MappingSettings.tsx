import { useState, useEffect } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import { useLang } from '../LangContext'

const API = import.meta.env.VITE_API_URL || '/api'

interface SystemField {
  id: number; key: string; label: string; type: string; dataType: string; formula: string | null; isCustom: boolean
}
interface MappingRow { systemFieldKey: string; sourceColumn: string }
interface NewField { label: string; type: 'fact' | 'calculated'; dataType: string; formula: string; sourceColumn: string }

const emptyNewField = (): NewField => ({ label: '', type: 'fact', dataType: 'number', formula: '', sourceColumn: '' })

export default function MappingSettings() {
  const { t } = useLang()
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login' }
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
    } catch (e: any) { setMessage('Error loading columns: ' + e.message) }
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
      setMessage(t('map_saved'))
    } catch (e: any) { setMessage('Error: ' + e.message) }
    setSaving(false)
  }

  const addCustomField = async () => {
    if (!newField.label) return setMessage((t as any)('map_field_col'))
    if (newField.type === 'calculated' && !newField.formula) return setMessage(t('map_formula'))
    if (newField.type === 'fact' && !newField.sourceColumn) return setMessage(t('map_source_col'))
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
      setMessage(t('map_added'))
    } catch (e: any) { setMessage('Error: ' + e.message) }
    setAddingField(false)
  }

  const deleteCustomField = async (key: string) => {
    if (!confirm(t('map_delete'))) return
    try {
      await axios.delete(`${API}/mapping/custom-field/${key}`)
      await loadData()
      setMessage(t('map_delete'))
    } catch (e: any) { setMessage('Error: ' + e.message) }
  }

  const factFields = systemFields.filter(f => f.type === 'fact')
  const calcFields = systemFields.filter(f => f.type === 'calculated')
  const allFieldKeys = systemFields.map(f => f.key)

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] text-[color:var(--text-primary)] flex items-center justify-center">{t('loading')}</div>

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[color:var(--text-primary)]">
      <Navbar active="settings" userRole={user?.role} rightSlot={
        <>
          <span className="text-[color:var(--text-muted)] text-sm">{user?.name}</span>
          <button onClick={handleLogout} style={{ background: 'var(--bg-input)' }} className="hover:bg-[var(--bg-hover)] px-3 py-1.5 rounded-lg text-sm transition">{t('action_logout')}</button>
        </>
      } />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">{`⚙️ ${t('map_title')}`}</h2>

        {/* Колонки источника */}
        <div style={{ background: 'var(--bg-card)' }} className="rounded-xl p-5 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{t('map_sheets_cols')}</h3>
            <button onClick={loadSourceColumns} disabled={loadingCols}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition">
              {loadingCols ? t('loading') : `🔄 ${t('map_source_cols')}`}
            </button>
          </div>
          {sourceColumns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sourceColumns.map(col => (
                <span key={col} style={{ background: 'var(--bg-input)' }} className="px-3 py-1 rounded-full text-sm text-blue-300">{col}</span>
              ))}
            </div>
          )}
        </div>

        {/* Таблица маппинга */}
        <div style={{ background: 'var(--bg-card)' }} className="rounded-xl p-5 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t('map_subtitle')}</h3>
            <button onClick={() => setShowAddField(v => !v)}
              style={{ background: 'var(--bg-input)' }} className="hover:bg-[var(--bg-hover)] px-3 py-1.5 rounded-lg text-sm transition">
              {showAddField ? `✕ ${t('filter_clear')}` : t('map_add_field')}
            </button>
          </div>
          <p className="text-[color:var(--text-muted)] text-sm mb-4">{t('map_subtitle')}</p>

          {showAddField && (
          <div style={{ background: 'var(--bg-input)' }} className="/30 rounded-xl p-4 border border-blue-500/30 mb-4">
            <h3 className="font-semibold mb-4 text-sm">{t('map_add_field')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{(t as any)('map_field_col')}</label>
                  <input type="text" value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    placeholder={t('map_placeholder_name')}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_field_type')}</label>
                  <select value={newField.type} onChange={e => setNewField(p => ({ ...p, type: e.target.value as 'fact' | 'calculated' }))}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                    <option value="fact">{`${t('map_if_fact')} (${t('map_source_col')})`}</option>
                    <option value="calculated">{`${t('map_calc')} (${t('map_formula')})`}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_data_type')}</label>
                  <select value={newField.dataType} onChange={e => setNewField(p => ({ ...p, dataType: e.target.value }))}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                    <option value="number">{`${t('map_integer')} / ${t('map_data_type')}`}</option>
                    <option value="integer">{t('map_integer')}</option>
                    <option value="percent">{t('map_percent')}</option>
                  </select>
                </div>
                {newField.type === 'fact' ? (
                  <div>
                    <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_source_col')}</label>
                    {sourceColumns.length > 0 ? (
                      <select value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                        <option value="">— {t('map_select')} —</option>
                        {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        placeholder={t('map_source_col')}
                        style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_formula')}</label>
                    <input type="text" value={newField.formula} onChange={e => setNewField(p => ({ ...p, formula: e.target.value }))}
                      placeholder={t('map_field_key')}
                      style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                )}
              </div>
              {newField.type === 'calculated' && (
                <div style={{ background: 'var(--bg-input)' }} className="/30 rounded-lg p-3">
                  <p className="text-xs text-[color:var(--text-muted)] mb-1">{t('map_available_fields')}</p>
                  <div className="flex flex-wrap gap-1">
                    {allFieldKeys.map(k => (
                      <span key={k} style={{ background: 'var(--bg-input)' }} className="px-2 py-0.5 rounded text-xs font-mono text-blue-300">{k}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={addCustomField} disabled={addingField}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
                {addingField ? t('map_adding') : `✓ ${t('map_add_btn')}`}
              </button>
            </div>
          </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-xs text-[color:var(--text-faint)] uppercase px-1">
              <span>{t('map_system_fields')}</span><span>{t('map_type_col')}</span><span>{t('map_source_col')}</span>
            </div>

            {/* Фактические поля */}
            {mappings.map((m, i) => {
              const sysField = factFields.find(f => f.key === m.systemFieldKey)
              if (!sysField) return null
              return (
                <div key={i} style={{ background: 'var(--bg-input)' }} className="grid grid-cols-3 gap-4 items-center /50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{sysField.label}</span>
                    {sysField.isCustom && (
                      <button onClick={() => deleteCustomField(sysField.key)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    )}
                  </div>
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full w-fit">{t('map_fact')}кт</span>
                  {sourceColumns.length > 0 ? (
                    <select value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                      className="t-bg-hover text-[color:var(--text-primary)] text-sm px-3 py-1.5 rounded-lg border border-gray-500">
                      <option value="">— {t('no_data')} —</option>
                      {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={m.sourceColumn} onChange={e => updateMapping(m.systemFieldKey, e.target.value)}
                      placeholder={t('map_source_col')}
                      className="t-bg-hover text-[color:var(--text-primary)] text-sm px-3 py-1.5 rounded-lg border border-gray-500 outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>
              )
            })}

            {/* Расчётные поля */}
            {calcFields.map(field => (
              <div key={field.key} style={{ background: 'var(--bg-input)' }} className="grid grid-cols-3 gap-4 items-center /20 rounded-lg px-3 py-2 border border-dashed border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--text-secondary)]">{field.label}</span>
                  {field.isCustom && (
                    <button onClick={() => deleteCustomField(field.key)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  )}
                </div>
                <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full w-fit">{t('map_calc')}</span>
                <span className="text-xs text-[color:var(--text-faint)] font-mono">{field.formula}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Форма добавления нового поля */}
        {showAddField && (
          <div style={{ background: 'var(--bg-card)' }} className="rounded-xl p-5 border border-blue-500/30">
            <h3 className="font-semibold mb-4">{t('map_add_field')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{(t as any)('map_field_col')}</label>
                  <input type="text" value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    placeholder={t('map_placeholder_name')}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_field_type')}</label>
                  <select value={newField.type} onChange={e => setNewField(p => ({ ...p, type: e.target.value as 'fact' | 'calculated' }))}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                    <option value="fact">{`${t('map_if_fact')} (${t('map_source_col')})`}</option>
                    <option value="calculated">{`${t('map_calc')} (${t('map_formula')})`}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_data_type')}</label>
                  <select value={newField.dataType} onChange={e => setNewField(p => ({ ...p, dataType: e.target.value }))}
                    style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                    <option value="number">{`${t('map_integer')} / ${t('map_data_type')}`}</option>
                    <option value="integer">{t('map_integer')}</option>
                    <option value="percent">{t('map_percent')}</option>
                  </select>
                </div>
                {newField.type === 'fact' ? (
                  <div>
                    <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_source_col')}</label>
                    {sourceColumns.length > 0 ? (
                      <select value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)]">
                        <option value="">— {t('map_select')} —</option>
                        {sourceColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={newField.sourceColumn} onChange={e => setNewField(p => ({ ...p, sourceColumn: e.target.value }))}
                        placeholder={t('map_source_col')}
                        style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-[color:var(--text-muted)] mb-1 block">{t('map_formula')}</label>
                    <input type="text" value={newField.formula} onChange={e => setNewField(p => ({ ...p, formula: e.target.value }))}
                      placeholder={t('map_field_key')}
                      style={{ background: 'var(--bg-input)' }} className="w-full text-[color:var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                )}
              </div>

              {newField.type === 'calculated' && (
                <div style={{ background: 'var(--bg-input)' }} className="/30 rounded-lg p-3">
                  <p className="text-xs text-[color:var(--text-muted)] mb-1">{t('map_available_fields')}</p>
                  <div className="flex flex-wrap gap-1">
                    {allFieldKeys.filter(k => !k.startsWith('custom_') || systemFields.find(f => f.key === k)?.type === 'fact').map(k => (
                      <span key={k} style={{ background: 'var(--bg-input)' }} className="px-2 py-0.5 rounded text-xs font-mono text-blue-300">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={addCustomField} disabled={addingField}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
                {addingField ? t('map_adding') : `✓ ${t('map_add_btn')}`}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.includes('Error') || message.startsWith('Error') || message.startsWith((t as any)('map_field_col').slice(0,3)) ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            {message}
            {message.includes(t('map_saved').slice(0, 6)) && (
              <a href="/mapping" className="ml-3 underline font-medium">{t('map_go_mapping')} →</a>
            )}
          </div>
        )}

        <button onClick={saveMapping} disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 py-3 rounded-xl font-medium transition">
          {saving ? t('loading') : t('map_save')}
        </button>
      </div>
    </div>
  )
}