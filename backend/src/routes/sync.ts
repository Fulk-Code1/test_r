import { Router, Request, Response } from 'express'
import { fetchSalesData } from '../lib/googleSheets'
import { prisma } from '../lib/prisma'

const router = Router()

const parseNum = (v: string) => parseFloat((v || '0').replace(/,/g, ''))
const parseIntVal = (v: string) => parseInt((v || '0').replace(/,/g, ''), 10)

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const rawData = await fetchSalesData()

    // Загружаем маппинг из БД
    const mappings = await prisma.fieldMapping.findMany({ include: { systemField: true } })

    // Функция получения значения по системному ключу через маппинг
    const getMapped = (row: Record<string, string>, key: string): string => {
      const mapping = mappings.find(m => m.systemField.key === key)
      if (mapping) return row[mapping.sourceColumn] || '0'
      // Фолбэк — ищем колонку по имени напрямую
      const directKeys: Record<string, string[]> = {
        revenue: ['Revenue', 'revenue'],
        quantity: ['Quantity', 'quantity'],
        checks: ['Checks', 'checks'],
        gross_profit: ['GrossProfit', 'Gross_Profit', 'gross_profit'],
        year: ['Year', 'year'],
        month: ['Month', 'month'],
        store: ['Store', 'store'],
      }
      for (const k of (directKeys[key] || [])) {
        if (row[k] !== undefined) return row[k]
      }
      return '0'
    }

    const records = rawData.map(row => {
      const revenue = parseNum(getMapped(row, 'revenue'))
      const quantity = parseIntVal(getMapped(row, 'quantity'))
      const checks = parseIntVal(getMapped(row, 'checks'))
      const grossProfit = parseNum(getMapped(row, 'gross_profit'))

      return {
        year: parseIntVal(getMapped(row, 'year')),
        month: parseIntVal(getMapped(row, 'month')),
        store: getMapped(row, 'store') || '',
        revenue,
        quantity,
        checks,
        grossProfit,
      }
    })

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