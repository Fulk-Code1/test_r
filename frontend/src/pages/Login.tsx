import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || '/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password })
      localStorage.setItem('token', res.data.token as string)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/')
    } catch {
      setError('Неверный email или пароль')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">📊 Sales Dashboard</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="text-gray-400 text-sm">Email</label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 bg-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Пароль</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full mt-1 bg-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <button type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition">
            Войти
          </button>
        </form>
        <p className="text-gray-500 text-sm text-center mt-4">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-blue-400 hover:underline">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  )
}