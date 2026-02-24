import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import salesRoutes from './routes/sales'
import syncRoutes from './routes/sync'

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api', syncRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))