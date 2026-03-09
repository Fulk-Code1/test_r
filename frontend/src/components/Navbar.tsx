import { useTheme } from '../ThemeContext'

interface NavbarProps {
  active: 'dashboard' | 'settings' | 'compare'
  rightSlot?: React.ReactNode
  userRole?: string
}

export default function Navbar({ active, rightSlot, userRole }: NavbarProps) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <nav style={{ background: 'var(--nav-bg)', borderBottomColor: 'var(--nav-border)' }}
      className="border-b px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <span className="text-2xl"></span>
        <h1 className="text-xl font-bold mr-4" style={{ color: 'var(--text-primary)' }}>Sales Dashboard</h1>
        <div className="flex items-center gap-1">
          <a href="/"
            style={active === 'dashboard'
              ? { background: '#2563eb', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90">
            Обзор
          </a>
          <a href="/compare"
            style={active === 'compare'
              ? { background: '#2563eb', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90">
            Сравнение
          </a>
          {userRole === 'admin' && (
            <a href="/mapping/settings"
              style={active === 'settings'
                ? { background: '#2563eb', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90">
              ⚙️ Настройки маппинга
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
        <button onClick={toggle} title={isDark ? 'Светлая тема' : 'Тёмная тема'}
          style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition hover:opacity-80">
          {isDark ? '☀️ Светлая' : '🌙 Тёмная'}
        </button>
      </div>
    </nav>
  )
}