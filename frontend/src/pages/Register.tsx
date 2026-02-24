import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await axios.post(`${API}/auth/register`, form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">Регистрация</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">{error}</div>}
          {[
            { label: 'Имя', key: 'name', type: 'text', placeholder: 'Иван Иванов' },
            { label: 'Email', key: 'email', type: 'email', placeholder: 'you@example.com' },
            { label: 'Пароль', key: 'password', type: 'password', placeholder: '••••••••' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-gray-400 text-sm">{f.label}</label>
              <input
                type={f.type} placeholder={f.placeholder}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full mt-1 bg-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition">
            Зарегистрироваться
          </button>
        </form>
        <p className="text-gray-500 text-sm text-center mt-4">
          Уже есть аккаунт? <Link to="/login" className="text-blue-400 hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  )
}