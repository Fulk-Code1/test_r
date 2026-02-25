import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../lib/jwt'

const router = Router()

function authMiddleware(req: Request & { user?: unknown }, res: Response, next: () => void) {
  const auth = req.headers.authorization
  if (!auth) { res.status(401).json({ error: 'No token' }); return }
  try {
    req.user = verifyToken(auth.replace('Bearer ', ''))
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

router.get('/kpi', authMiddleware, async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const agg = await prisma.saleRecord.aggregate({
    where,
    _sum: { revenue: true, quantity: true, checks: true },
    _count: { id: true },
  })
  const totalRevenue = agg._sum.revenue || 0
  const totalQuantity = agg._sum.quantity || 0
  const totalChecks = agg._sum.checks || 0
  const avgRevPerCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0
  res.json({ totalRevenue, totalQuantity, totalChecks, avgRevPerCheck, recordCount: agg._count.id })
})

router.get('/by-year', authMiddleware, async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.groupBy({
    by: ['year'],
    _sum: { revenue: true, quantity: true, checks: true },
    orderBy: { year: 'asc' },
  })
  res.json(data.map(d => ({ year: d.year, revenue: d._sum.revenue, quantity: d._sum.quantity, checks: d._sum.checks })))
})

router.get('/by-store', authMiddleware, async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const data = await prisma.saleRecord.groupBy({
    by: ['store'],
    where,
    _sum: { revenue: true, quantity: true, checks: true },
    orderBy: { _sum: { revenue: 'desc' } },
  })
  res.json(data.map(d => ({ store: d.store, revenue: d._sum.revenue, quantity: d._sum.quantity, checks: d._sum.checks })))
})

router.get('/trend', authMiddleware, async (req: Request, res: Response) => {
  const { year } = req.query
  const where = year ? { year: parseInt(year as string) } : {}
  const data = await prisma.saleRecord.groupBy({
    by: ['year', 'month'],
    where,
    _sum: { revenue: true, quantity: true, checks: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
  res.json(data.map(d => ({
    label: `${months[d.month-1]} ${d.year}`,
    year: d.year,
    month: d.month,
    revenue: d._sum.revenue,
    quantity: d._sum.quantity,
    checks: d._sum.checks,
  })))
})

router.get('/table', authMiddleware, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 15
  const search = req.query.search as string || ''
  const year = req.query.year ? parseInt(req.query.year as string) : undefined
  const where: any = {}
  if (search) where.store = { contains: search, mode: 'insensitive' }
  if (year) where.year = year
  const [total, data] = await Promise.all([
    prisma.saleRecord.count({ where }),
    prisma.saleRecord.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { store: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    })
  ])
  res.json({ data, total, page, pages: Math.ceil(total / limit) })
})

router.get('/years', authMiddleware, async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.findMany({
    select: { year: true },
    distinct: ['year'],
    orderBy: { year: 'asc' },
  })
  res.json(data.map(d => d.year))
})

export default router