import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MappingDashboard from './pages/MappingDashboard'
import MappingSettings from './pages/MappingSettings'
import Compare from './pages/Compare'
import Login from './pages/Login'

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = getUser()
  if (!user || user.role !== 'admin') return <Navigate to="/" />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/mapping" element={<RequireAuth><MappingDashboard /></RequireAuth>} />
      <Route path="/mapping/settings" element={<RequireAuth><RequireAdmin><MappingSettings /></RequireAdmin></RequireAuth>} />
      <Route path="/compare" element={<RequireAuth><Compare /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}