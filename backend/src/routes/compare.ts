import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/compare', async (req: Request, res: Response) => {
  try {
    const { stores, months, years, yearFrom, yearTo } = req.query

    const storeList = stores ? (stores as string).split(',') : []
    const monthList = months ? (months as string).split(',').map(Number) : []
    const yearList = years ? (years as string).split(',').map(Number) : []

    if (storeList.length === 0 && monthList.length === 0 && yearList.length === 0) {
      return res.json([])
    }

    const where: any = {}
    if (storeList.length > 0) where.store = { in: storeList }
    if (monthList.length > 0) where.month = { in: monthList }
    if (yearList.length > 0) where.year = { in: yearList }
    if (yearFrom) where.year = { ...where.year, gte: Number(yearFrom) }
    if (yearTo) where.year = { ...where.year, lte: Number(yearTo) }

    const records = await prisma.saleRecord.findMany({ where })

    const mode = (req.query.mode as string) || 'store'

    // ──────────────────────────────────────────────
    // Специальный режим: строки = период (год-месяц), столбцы = магазины
    if (mode === 'store-month') {
      const periods: Record<string, Record<string, any>> = {}

      for (const r of records) {
        const period = `${r.year}-${String(r.month).padStart(2, '0')}`
        if (!periods[period]) periods[period] = { period }
        if (!periods[period][r.store]) {
          periods[period][r.store] = { revenue: 0, grossProfit: 0, quantity: 0, checks: 0 }
        }
        periods[period][r.store].revenue += r.revenue
        periods[period][r.store].grossProfit += r.grossProfit
        periods[period][r.store].quantity += r.quantity
        periods[period][r.store].checks += r.checks
      }

      const rows = Object.values(periods).sort((a: any, b: any) => a.period.localeCompare(b.period))

      return res.json({
        mode: 'store-month',
        stores: storeList.length > 0 ? storeList : [...new Set(records.map(r => r.store))],
        rows
      })
    }

    // ──────────────────────────────────────────────
    // Обычные режимы: store, month, year
    type Group = {
      key: string
      revenue: number
      grossProfit: number
      quantity: number
      checks: number
      count: number
    }

    const groups: Record<string, Group> = {}

    for (const r of records) {
      let key = ''
      if (mode === 'store') key = r.store
      else if (mode === 'month') key = `${r.year}-${String(r.month).padStart(2, '0')}`
      else if (mode === 'year') key = String(r.year)
      else key = r.store

      if (!groups[key]) groups[key] = { key, revenue: 0, grossProfit: 0, quantity: 0, checks: 0, count: 0 }
      groups[key].revenue += r.revenue
      groups[key].grossProfit += r.grossProfit
      groups[key].quantity += r.quantity
      groups[key].checks += r.checks
      groups[key].count++
    }

    const result = Object.values(groups).map(g => ({
      key: g.key,
      revenue: g.revenue,
      grossProfit: g.grossProfit,
      quantity: g.quantity,
      checks: g.checks,
      margin: g.revenue > 0 ? (g.grossProfit / g.revenue) * 100 : 0,
      avgCheck: g.checks > 0 ? g.revenue / g.checks : 0,
      avgMargin: g.revenue > 0 ? (g.grossProfit / g.revenue) * 100 : 0,
    }))

    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Список всех магазинов
router.get('/compare/stores', async (req: Request, res: Response) => {
  const stores = await prisma.saleRecord.findMany({
    select: { store: true },
    distinct: ['store'],
    orderBy: { store: 'asc' }
  })
  res.json(stores.map(s => s.store))
})

export default router