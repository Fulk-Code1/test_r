import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../lib/jwt'

const router = Router()

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

// Сводная статистика (KPI)
router.get('/kpi', authMiddleware, async (req: any, res: Response) => {
  const agg = await prisma.saleRecord.aggregate({
    _sum: { totalRevenue: true, totalCost: true, totalProfit: true, unitsSold: true },
    _count: true,
  })
  const avgOrderValue = agg._count > 0 
    ? (agg._sum.totalRevenue || 0) / agg._count 
    : 0
  const profitMargin = (agg._sum.totalRevenue || 0) > 0
    ? ((agg._sum.totalProfit || 0) / (agg._sum.totalRevenue || 0)) * 100
    : 0
    
  res.json({
    totalRevenue: agg._sum.totalRevenue || 0,
    totalCost: agg._sum.totalCost || 0,
    totalProfit: agg._sum.totalProfit || 0,
    totalOrders: agg._count,
    totalUnitsSold: agg._sum.unitsSold || 0,
    avgOrderValue,
    profitMargin,
  })
})

// Прибыль по регионам
router.get('/by-region', authMiddleware, async (req: any, res: Response) => {
  const data = await prisma.saleRecord.groupBy({
    by: ['region'],
    _sum: { totalRevenue: true, totalProfit: true },
    _count: true,
  })
  res.json(data)
})

// По категории товара
router.get('/by-item', authMiddleware, async (req: any, res: Response) => {
  const data = await prisma.saleRecord.groupBy({
    by: ['itemType'],
    _sum: { totalRevenue: true, totalProfit: true, unitsSold: true },
    orderBy: { _sum: { totalRevenue: 'desc' } },
  })
  res.json(data)
})

// По каналу продаж
router.get('/by-channel', authMiddleware, async (req: any, res: Response) => {
  const data = await prisma.saleRecord.groupBy({
    by: ['salesChannel'],
    _sum: { totalRevenue: true, totalProfit: true },
    _count: true,
  })
  res.json(data)
})

// Тренд по месяцам (для line chart)
router.get('/trend', authMiddleware, async (req: any, res: Response) => {
  const records = await prisma.saleRecord.findMany({
    select: { orderDate: true, totalRevenue: true, totalProfit: true },
    orderBy: { orderDate: 'asc' },
  })
  
  const monthly: Record<string, { revenue: number; profit: number }> = {}
  records.forEach(r => {
    const key = `${r.orderDate.getFullYear()}-${String(r.orderDate.getMonth()+1).padStart(2,'0')}`
    if (!monthly[key]) monthly[key] = { revenue: 0, profit: 0 }
    monthly[key].revenue += r.totalRevenue
    monthly[key].profit += r.totalProfit
  })
  
  res.json(Object.entries(monthly).map(([month, v]) => ({ month, ...v })))
})

// Таблица с пагинацией
router.get('/table', authMiddleware, async (req: any, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const search = req.query.search as string || ''
  
  const where = search ? {
    OR: [
      { region: { contains: search, mode: 'insensitive' as any } },
      { country: { contains: search, mode: 'insensitive' as any } },
      { itemType: { contains: search, mode: 'insensitive' as any } },
    ]
  } : {}
  
  const [total, records] = await Promise.all([
    prisma.saleRecord.count({ where }),
    prisma.saleRecord.findMany({
      where, skip: (page-1)*limit, take: limit,
      orderBy: { orderDate: 'desc' }
    })
  ])
  
  res.json({ records, total, page, pages: Math.ceil(total/limit) })
})

export default router