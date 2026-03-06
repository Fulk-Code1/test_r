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
  const { year, store } = req.query
  const where: any = {}
  if (year)  where.year  = parseInt(year as string)
  if (store) where.store = store as string
  const [agg, storeCount] = await Promise.all([
    prisma.saleRecord.aggregate({
      where,
      _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.saleRecord.findMany({ where, select: { store: true }, distinct: ['store'] }),
  ])
  const totalRevenue = agg._sum.revenue || 0
  const totalGrossProfit = agg._sum.grossProfit || 0
  const totalChecks = agg._sum.checks || 0
  const totalQuantity = agg._sum.quantity || 0
  const uniqueStores = storeCount.length || 1
  const { margin, avgCheck, fillRate } = calcMetrics(totalRevenue, totalGrossProfit, totalChecks, totalQuantity)
  const avgQuantityPerStore = Math.round(totalQuantity / uniqueStores)
  res.json({ totalRevenue, totalGrossProfit, totalChecks, totalQuantity, margin, avgCheck, fillRate, recordCount: agg._count.id, avgQuantityPerStore, uniqueStores })
})

router.get('/by-year', async (req: Request, res: Response) => {
  const { store } = req.query
  const where: any = {}
  if (store) where.store = store as string
  const data = await prisma.saleRecord.groupBy({
    by: ['year'],
    where,
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
  const { year, store } = req.query
  const where: any = {}
  if (year)  where.year  = parseInt(year as string)
  if (store) where.store = store as string
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
  const { year, store } = req.query
  const where: any = {}
  if (year)  where.year  = parseInt(year as string)
  if (store) where.store = store as string
  const [data, storesByMonth] = await Promise.all([
    prisma.saleRecord.groupBy({
      by: ['year', 'month'],
      where,
      _sum: { revenue: true, quantity: true, checks: true, grossProfit: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    }),
    prisma.saleRecord.groupBy({
      by: ['year', 'month', 'store'],
      where,
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    }),
  ])
  // Считаем кол-во уникальных магазинов за каждый месяц
  const storeCountMap: Record<string, number> = {}
  storesByMonth.forEach(r => {
    const key = `${r.year}-${r.month}`
    storeCountMap[key] = (storeCountMap[key] || 0) + 1
  })
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
  res.json(data.map(d => {
    const key = `${d.year}-${d.month}`
    const storeCount = storeCountMap[key] || 1
    const quantity = d._sum.quantity || 0
    return {
      label: `${months[d.month-1]} ${d.year}`,
      year: d.year,
      month: d.month,
      revenue: d._sum.revenue || 0,
      grossProfit: d._sum.grossProfit || 0,
      checks: d._sum.checks || 0,
      quantity,
      storeCount,
      avgQuantityPerStore: Math.round(quantity / storeCount),
    }
  }))
})

router.get('/table', async (req: Request, res: Response) => {
  const page    = parseInt(req.query.page as string) || 1
  const limit   = parseInt(req.query.limit as string) || 15
  const search  = (req.query.search as string) || ''
  const sortBy  = (req.query.sortBy as string) || 'year'
  const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc'

  // Мультизначения
  const years   = (req.query.years  as string) ? (req.query.years  as string).split(',').map(Number).filter(Boolean) : []
  const months  = (req.query.months as string) ? (req.query.months as string).split(',').map(Number).filter(Boolean) : []
  const stores  = (req.query.stores as string) ? (req.query.stores as string).split(',').filter(Boolean) : []

  // Числовые диапазоны
  const revenueMin    = req.query.revenueMin    ? parseFloat(req.query.revenueMin as string)    : undefined
  const revenueMax    = req.query.revenueMax    ? parseFloat(req.query.revenueMax as string)    : undefined
  const grossProfitMin = req.query.grossProfitMin ? parseFloat(req.query.grossProfitMin as string) : undefined
  const grossProfitMax = req.query.grossProfitMax ? parseFloat(req.query.grossProfitMax as string) : undefined
  const checksMin     = req.query.checksMin     ? parseFloat(req.query.checksMin as string)     : undefined
  const checksMax     = req.query.checksMax     ? parseFloat(req.query.checksMax as string)     : undefined
  const quantityMin   = req.query.quantityMin   ? parseFloat(req.query.quantityMin as string)   : undefined
  const quantityMax   = req.query.quantityMax   ? parseFloat(req.query.quantityMax as string)   : undefined

  const where: any = {}

  if (search)         where.store = { contains: search, mode: 'insensitive' }
  if (years.length)   where.year  = { in: years }
  if (months.length)  where.month = { in: months }
  if (stores.length)  where.store = { in: stores }

  if (revenueMin !== undefined || revenueMax !== undefined)
    where.revenue = { ...(revenueMin !== undefined ? { gte: revenueMin } : {}), ...(revenueMax !== undefined ? { lte: revenueMax } : {}) }

  if (grossProfitMin !== undefined || grossProfitMax !== undefined)
    where.grossProfit = { ...(grossProfitMin !== undefined ? { gte: grossProfitMin } : {}), ...(grossProfitMax !== undefined ? { lte: grossProfitMax } : {}) }

  if (checksMin !== undefined || checksMax !== undefined)
    where.checks = { ...(checksMin !== undefined ? { gte: checksMin } : {}), ...(checksMax !== undefined ? { lte: checksMax } : {}) }

  if (quantityMin !== undefined || quantityMax !== undefined)
    where.quantity = { ...(quantityMin !== undefined ? { gte: quantityMin } : {}), ...(quantityMax !== undefined ? { lte: quantityMax } : {}) }

  // Сортировка — margin и avgCheck вычисляются, сортируем по базовым полям
  const sortMap: Record<string, any> = {
    year:        [{ year: sortDir },        { month: sortDir }, { store: 'asc' }],
    month:       [{ month: sortDir },       { year: sortDir },  { store: 'asc' }],
    store:       [{ store: sortDir }],
    revenue:     [{ revenue: sortDir }],
    grossProfit: [{ grossProfit: sortDir }],
    checks:      [{ checks: sortDir }],
    quantity:    [{ quantity: sortDir }],
    margin:      [{ grossProfit: sortDir }], // приближение
    avgCheck:    [{ revenue: sortDir }],     // приближение
  }
  const orderBy = sortMap[sortBy] || sortMap['year']

  const marginMin   = req.query.marginMin   ? parseFloat(req.query.marginMin as string)   : undefined
  const marginMax   = req.query.marginMax   ? parseFloat(req.query.marginMax as string)   : undefined
  const avgCheckMin = req.query.avgCheckMin ? parseFloat(req.query.avgCheckMin as string) : undefined
  const avgCheckMax = req.query.avgCheckMax ? parseFloat(req.query.avgCheckMax as string) : undefined

  const needsCalcFilter = marginMin !== undefined || marginMax !== undefined || avgCheckMin !== undefined || avgCheckMax !== undefined
  const needsCalcSort   = sortBy === 'margin' || sortBy === 'avgCheck'

  let data: any[]

  if (needsCalcFilter || needsCalcSort) {
    // Загружаем все записи по базовым фильтрам, считаем метрики, фильтруем/сортируем в памяти
    const allRecords = await prisma.saleRecord.findMany({ where })
    let mapped = allRecords.map(r => {
      const { margin, avgCheck, fillRate } = calcMetrics(r.revenue, r.grossProfit, r.checks, r.quantity)
      return { year: r.year, month: r.month, store: r.store, revenue: r.revenue, grossProfit: r.grossProfit, checks: r.checks, quantity: r.quantity, margin, avgCheck, fillRate }
    })
    if (marginMin   !== undefined) mapped = mapped.filter(r => r.margin   >= marginMin!)
    if (marginMax   !== undefined) mapped = mapped.filter(r => r.margin   <= marginMax!)
    if (avgCheckMin !== undefined) mapped = mapped.filter(r => r.avgCheck >= avgCheckMin!)
    if (avgCheckMax !== undefined) mapped = mapped.filter(r => r.avgCheck <= avgCheckMax!)
    if (sortBy === 'margin')   mapped.sort((a, b) => sortDir === 'asc' ? a.margin   - b.margin   : b.margin   - a.margin)
    if (sortBy === 'avgCheck') mapped.sort((a, b) => sortDir === 'asc' ? a.avgCheck - b.avgCheck : b.avgCheck - a.avgCheck)
    const total = mapped.length
    data = mapped.slice((page - 1) * limit, page * limit)
    return res.json({ data, total, page, pages: Math.ceil(total / limit) })
  }

  // Стандартный путь — фильтрация и сортировка через БД
  const [total, records] = await Promise.all([
    prisma.saleRecord.count({ where }),
    prisma.saleRecord.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit })
  ])
  data = records.map(r => {
    const { margin, avgCheck, fillRate } = calcMetrics(r.revenue, r.grossProfit, r.checks, r.quantity)
    return { year: r.year, month: r.month, store: r.store, revenue: r.revenue, grossProfit: r.grossProfit, checks: r.checks, quantity: r.quantity, margin, avgCheck, fillRate }
  })
  res.json({ data, total, page, pages: Math.ceil(total / limit) })
})

router.get('/years', async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.findMany({ select: { year: true }, distinct: ['year'], orderBy: { year: 'asc' } })
  res.json(data.map(d => d.year))
})

router.get('/stores', async (req: Request, res: Response) => {
  const data = await prisma.saleRecord.findMany({ select: { store: true }, distinct: ['store'], orderBy: { store: 'asc' } })
  res.json(data.map(d => d.store))
})

export default router