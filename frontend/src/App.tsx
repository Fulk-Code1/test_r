import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MappingDashboard from './pages/MappingDashboard'
import MappingSettings from './pages/MappingSettings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/mapping" element={<MappingDashboard />} />
      <Route path="/mapping/settings" element={<MappingSettings />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
} 