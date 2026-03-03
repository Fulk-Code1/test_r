const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

interface SyncResult {
  newCount: number
  updCount: number
  updates: { store: string; year: number; month: number }[]
}

interface Props {
  result: SyncResult
  onClose: () => void
}

export default function SyncNotification({ result, onClose }: Props) {
  return (
    <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 max-w-sm w-full z-50">
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-semibold text-green-400">✓ Синхронизация завершена</h4>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
      </div>
      <div className="flex gap-4 mb-3 text-sm">
        <div className="bg-green-500/10 text-green-400 px-3 py-1.5 rounded-lg">
          <span className="font-bold">{result.newCount}</span> новых
        </div>
        <div className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg">
          <span className="font-bold">{result.updCount}</span> обновлено
        </div>
      </div>
      {result.updates.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-2">Обновлённые записи:</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {result.updates.map((u, i) => (
              <div key={i} className="text-xs bg-gray-700/50 rounded px-2 py-1 text-gray-300">
                {u.store} — {MONTHS[u.month - 1]} {u.year}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}