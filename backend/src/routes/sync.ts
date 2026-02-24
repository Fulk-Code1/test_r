import { Router, Request, Response } from 'express'
import { fetchSalesData } from '../lib/googleSheets'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../lib/jwt'

const router = Router()

// Middleware auth
function authMiddleware(req: any, res: Response, next: any) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'No token' })
  try {
    req.user = verifyToken(auth.replace('Bearer ', ''))
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawData = await fetchSalesData()
    
    // Адаптируй названия колонок под свой датасет!
    const records = rawData.map(row => ({
      orderDate: new Date(row['Order Date'] || row['Date'] || Date.now()),
      region: row['Region'] || '',
      country: row['Country'] || '',
      itemType: row['Item Type'] || '',
      salesChannel: row['Sales Channel'] || '',
      orderPriority: row['Order Priority'] || '',
      unitsSold: parseInt(row['Units Sold'] || '0'),
      unitPrice: parseFloat(row['Unit Price'] || '0'),
      unitCost: parseFloat(row['Unit Cost'] || '0'),
      totalRevenue: parseFloat(row['Total Revenue'] || '0'),
      totalCost: parseFloat(row['Total Cost'] || '0'),
      totalProfit: parseFloat(row['Total Profit'] || '0'),
    }))

    await prisma.saleRecord.deleteMany({})
    await prisma.saleRecord.createMany({ data: records })
    
    await prisma.syncLog.create({
      data: { rowsCount: records.length, status: 'success' }
    })
    
    res.json({ message: 'Synced', count: records.length })
  } catch (e: any) {
    await prisma.syncLog.create({
      data: { rowsCount: 0, status: 'error', message: e.message }
    })
    res.status(500).json({ error: e.message })
  }
})

router.get('/sync/logs', authMiddleware, async (req: Request, res: Response) => {
  const logs = await prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 10 })
  res.json(logs)
})

export default router