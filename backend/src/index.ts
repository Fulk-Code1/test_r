import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import salesRoutes from './routes/sales'
import syncRoutes, { runSync } from './routes/sync'
import mappingRoutes, { initSystemFields } from './routes/mapping'

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api', syncRoutes)
app.use('/api', mappingRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 4000
app.listen(PORT, async () => {
  console.log(`Backend running on port ${PORT}`)
  await initSystemFields()

  // Автосинк каждый час
  const ONE_HOUR = 60 * 60 * 1000
  setInterval(async () => {
    console.log('[AutoSync] Starting hourly sync...')
    try {
      const result = await runSync()
      console.log(`[AutoSync] Done: ${result.newCount} new, ${result.updCount} updated`)
    } catch (e) {
      console.error('[AutoSync] Error:', e)
    }
  }, ONE_HOUR)
})