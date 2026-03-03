interface NavbarProps {
  active: 'dashboard' | 'mapping' | 'settings'
  rightSlot?: React.ReactNode
  userRole?: string
}

export default function Navbar({ active, rightSlot, userRole }: NavbarProps) {
  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <span className="text-2xl"></span>
        <h1 className="text-xl font-bold mr-4">Sales Dashboard</h1>
        <div className="flex items-center gap-1">
          <a href="/"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${active === 'dashboard' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
            Дашборд
          </a>
          <a href="/mapping"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${active === 'mapping' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
            Маппинг
          </a>
          {userRole === 'admin' && (
            <a href="/mapping/settings"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${active === 'settings' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              ⚙️ Настройки маппинга
            </a>
          )}
        </div>
      </div>
      {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
    </nav>
  )
}