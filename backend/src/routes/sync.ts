import { Router, Request, Response } from 'express'
import { fetchSalesData } from '../lib/googleSheets'
import { prisma } from '../lib/prisma'

const router = Router()

const parseNum = (v: string) => parseFloat((v || '0').replace(/,/g, ''))
const parseIntVal = (v: string) => parseInt((v || '0').replace(/,/g, ''), 10)

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const rawData = await fetchSalesData()
    const records = rawData.map(row => ({
      year: parseIntVal(row['Year']),
      month: parseIntVal(row['Month']),
      store: row['Store'] || '',
      revenue: parseNum(row['Revenue']),
      quantity: parseIntVal(row['Quantity']),
      checks: parseIntVal(row['Checks']),
    }))
    await prisma.saleRecord.deleteMany({})
    await prisma.saleRecord.createMany({ data: records })
    await prisma.syncLog.create({ data: { rowsCount: records.length, status: 'success' } })
    res.json({ message: 'Synced', count: records.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    await prisma.syncLog.create({ data: { rowsCount: 0, status: 'error', message } })
    res.status(500).json({ error: message })
  }
})

router.get('/sync/logs', async (req: Request, res: Response) => {
  const logs = await prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 10 })
  res.json(logs)
})

export default router