import { useTheme } from '../ThemeContext'
import { useLang } from '../LangContext'
import type { Lang } from '../i18n'

interface NavbarProps {
  active: 'dashboard' | 'settings' | 'compare'
  rightSlot?: React.ReactNode
  userRole?: string
}

const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'RU' },
  { code: 'ro', label: 'RO' },
  { code: 'en', label: 'EN' },
]

export default function Navbar({ active, rightSlot, userRole }: NavbarProps) {
  const { theme, toggle } = useTheme()
  const { lang, setLang, t } = useLang()
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
            {t('nav_overview')}
          </a>
          <a href="/compare"
            style={active === 'compare'
              ? { background: '#2563eb', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90">
            {t('nav_compare')}
          </a>
          {userRole === 'admin' && (
            <a href="/mapping/settings"
              style={active === 'settings'
                ? { background: '#2563eb', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90">
              {t('nav_mapping')}
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}

        {/* Language switcher */}
        <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => setLang(l.code)}
              style={lang === l.code
                ? { background: '#2563eb', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }}
              className="px-3 py-2 text-xs font-semibold transition hover:opacity-80">
              {l.label}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button onClick={toggle} title={isDark ? t('nav_theme_light') : t('nav_theme_dark')}
          style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition hover:opacity-80">
          {isDark ? t('nav_theme_light') : t('nav_theme_dark')}
        </button>
      </div>
    </nav>
  )
}