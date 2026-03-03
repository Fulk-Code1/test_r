import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

function calcMetrics(revenue: number, grossProfit: number, checks: number, quantity: number) {
  const margin = revenue > 0 ? (grossProfit / revenue * 100) : 0
  const avgCheck = checks > 0 ? (revenue / checks) : 0
  const fillRate = checks > 0 ? (quantity / checks) : 0
  return { margin, avgCheck, fillRate }
}

router.get('/kpi', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const agg = await prisma.saleRecord.aggregate({
    where,
    _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
    _count: { id: true },
  })
  const totalRevenue = agg._sum.revenue || 0
  const totalGrossProfit = agg._sum.grossProfit || 0
  const totalChecks = agg._sum.checks || 0
  const totalQuantity = agg._sum.quantity || 0
  const { margin, avgCheck, fillRate } = calcMetrics(totalRevenue, totalGrossProfit, totalChecks, totalQuantity)
  res.json({ totalRevenue, totalGrossProfit, totalChecks, totalQuantity, margin, avgCheck, fillRate, recordCount: agg._count.id })
})

router.get('/by-year', async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.groupBy({
    by: ['year'],
    _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
    orderBy: { year: 'asc' },
  })
  res.json(data.map(d => ({
    year: d.year,
    revenue: d._sum.revenue || 0,
    grossProfit: d._sum.grossProfit || 0,
    quantity: d._sum.quantity || 0,
    checks: d._sum.checks || 0,
  })))
})

router.get('/by-store', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const data = await prisma.saleRecord.groupBy({
    by: ['store'],
    where,
    _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
    orderBy: { _sum: { revenue: 'desc' } },
  })
  res.json(data.map(d => ({
    store: d.store,
    revenue: d._sum.revenue || 0,
    grossProfit: d._sum.grossProfit || 0,
    quantity: d._sum.quantity || 0,
    checks: d._sum.checks || 0,
  })))
})

router.get('/trend', async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const data = await prisma.saleRecord.groupBy({
    by: ['year', 'month'],
    where,
    _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
  res.json(data.map(d => ({
    label: `${months[d.month-1]} ${d.year}`,
    year: d.year,
    month: d.month,
    revenue: d._sum.revenue || 0,
    grossProfit: d._sum.grossProfit || 0,
    checks: d._sum.checks || 0,
    quantity: d._sum.quantity || 0,
  })))
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
    const { margin, avgCheck, fillRate } = calcMetrics(r.revenue, r.grossProfit, r.checks, r.quantity)
    return { year: r.year, month: r.month, store: r.store, revenue: r.revenue, grossProfit: r.grossProfit, checks: r.checks, quantity: r.quantity, margin, avgCheck, fillRate }
  })
  res.json({ data, total, page, pages: Math.ceil(total / limit) })
})

router.get('/years', async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.findMany({ select: { year: true }, distinct: ['year'], orderBy: { year: 'asc' } })
  res.json(data.map(d => d.year))
})

export default router