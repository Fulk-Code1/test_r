import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'

export default function Login() {
  const [isSetup, setIsSetup] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/auth/setup-required`).then(res => {
      setIsSetup(res.data.setupRequired)
      setLoading(false)
    })
  }, [])

  const handleSubmit = async () => {
    setError('')
    try {
      const endpoint = isSetup ? '/auth/setup' : '/auth/login'
      const body = isSetup ? form : { email: form.email, password: form.password }
      const res = await axios.post(`${API}${endpoint}`, body)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      window.location.href = '/'
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка')
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Загрузка...</div>

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700">
        <div className="text-center mb-6">
          <span className="text-4xl"></span>
          <h1 className="text-2xl font-bold text-white mt-2">Sales Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isSetup ? 'Создание первого администратора' : 'Войдите в систему'}
          </p>
        </div>

        {isSetup && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-1 block">Имя</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Введите имя"
              className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">Email</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="admin@example.com"
            className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>

        <div className="mb-6">
          <label className="text-xs text-gray-400 mb-1 block">Пароль</label>
          <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>

        {error && <div className="bg-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4">{error}</div>}

        <button onClick={handleSubmit}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition">
          {isSetup ? 'Создать администратора' : 'Войти'}
        </button>
      </div>
    </div>
  )
}