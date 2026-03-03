import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

function getNum(data: any, key: string): number {
  if (!data) return 0
  return parseFloat(data[key] || 0) || 0
}

router.get('/kpi', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const records = await prisma.saleRecord.findMany({ where })

  let totalRevenue = 0, totalGrossProfit = 0, totalChecks = 0, totalQuantity = 0

  for (const r of records) {
    const d = r.data as any
    totalRevenue += getNum(d, 'revenue')
    totalGrossProfit += getNum(d, 'gross_profit')
    totalChecks += getNum(d, 'checks')
    totalQuantity += getNum(d, 'quantity')
  }

  const margin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue * 100) : 0
  const avgCheck = totalChecks > 0 ? (totalRevenue / totalChecks) : 0
  const fillRate = totalChecks > 0 ? (totalQuantity / totalChecks) : 0

  res.json({ totalRevenue, totalGrossProfit, totalChecks, totalQuantity, margin, avgCheck, fillRate, recordCount: records.length })
})

router.get('/by-year', async (req: Request, res: Response) => {
  const records = await prisma.saleRecord.findMany()
  const byYear: Record<number, any> = {}

  for (const r of records) {
    const d = r.data as any
    if (!byYear[r.year]) byYear[r.year] = { year: r.year, revenue: 0, grossProfit: 0, checks: 0, quantity: 0 }
    byYear[r.year].revenue += getNum(d, 'revenue')
    byYear[r.year].grossProfit += getNum(d, 'gross_profit')
    byYear[r.year].checks += getNum(d, 'checks')
    byYear[r.year].quantity += getNum(d, 'quantity')
  }

  res.json(Object.values(byYear).sort((a, b) => a.year - b.year))
})

router.get('/by-store', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const records = await prisma.saleRecord.findMany({ where })
  const byStore: Record<string, any> = {}

  for (const r of records) {
    const d = r.data as any
    if (!byStore[r.store]) byStore[r.store] = { store: r.store, revenue: 0, grossProfit: 0, checks: 0, quantity: 0 }
    byStore[r.store].revenue += getNum(d, 'revenue')
    byStore[r.store].grossProfit += getNum(d, 'gross_profit')
    byStore[r.store].checks += getNum(d, 'checks')
    byStore[r.store].quantity += getNum(d, 'quantity')
  }

  res.json(Object.values(byStore).sort((a, b) => b.revenue - a.revenue))
})

router.get('/trend', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const records = await prisma.saleRecord.findMany({ where })
  const byMonthYear: Record<string, any> = {}
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

  for (const r of records) {
    const d = r.data as any
    const key = `${r.year}-${r.month}`
    if (!byMonthYear[key]) byMonthYear[key] = { year: r.year, month: r.month, label: `${months[r.month-1]} ${r.year}`, revenue: 0, checks: 0, grossProfit: 0 }
    byMonthYear[key].revenue += getNum(d, 'revenue')
    byMonthYear[key].checks += getNum(d, 'checks')
    byMonthYear[key].grossProfit += getNum(d, 'gross_profit')
  }

  res.json(Object.values(byMonthYear).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month))
})

router.get('/table', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 15
  const search = req.query.search as string || ''
  const year = req.query.year ? parseInt(req.query.year as string) : undefined
  const where: any = {}
  if (search) where.store = { contains: search, mode: 'insensitive' }
  if (year) where.year = year

  const [total, records] = await Promise.all([
    prisma.saleRecord.count({ where }),
    prisma.saleRecord.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { store: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    })
  ])

  const data = records.map(r => {
    const d = r.data as any
    return {
      year: r.year,
      month: r.month,
      store: r.store,
      revenue: getNum(d, 'revenue'),
      grossProfit: getNum(d, 'gross_profit'),
      checks: getNum(d, 'checks'),
      quantity: getNum(d, 'quantity'),
      margin: getNum(d, 'margin'),
      avgCheck: getNum(d, 'avg_check'),
      fillRate: getNum(d, 'fill_rate'),
    }
  })

  res.json({ data, total, page, pages: Math.ceil(total / limit) })
})

router.get('/years', async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.findMany({ select: { year: true }, distinct: ['year'], orderBy: { year: 'asc' } })
  res.json(data.map(d => d.year))
})

export default router