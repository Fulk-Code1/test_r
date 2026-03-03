import { Router, Request, Response } from 'express'
import { fetchSalesData } from '../lib/googleSheets'
import { prisma } from '../lib/prisma'

const router = Router()

const parseNum = (v: string) => parseFloat((v || '0').replace(/,/g, ''))
const parseIntVal = (v: string) => parseInt((v || '0').replace(/,/g, ''), 10)

function evalFormula(formula: string, data: Record<string, number>): number {
  let expr = formula
  for (const [key, val] of Object.entries(data)) {
    expr = expr.replace(new RegExp('\\b' + key + '\\b', 'g'), String(val || 0))
  }
  try { return Function('"use strict"; return (' + expr + ')')() } catch { return 0 }
}

export async function runSync(): Promise<{ count: number; newCount: number; updCount: number; updates: any[] }> {
  const rawData = await fetchSalesData()
  const mappings = await prisma.fieldMapping.findMany({ include: { systemField: true } })
  const allFields = await prisma.systemField.findMany()
  const calcFields = allFields.filter(f => f.type === 'calculated')
  const customFactFields = allFields.filter(f => f.isCustom && f.type === 'fact')

  const getMapped = (row: Record<string, string>, key: string): string => {
    const mapping = mappings.find(m => m.systemField.key === key)
    if (mapping) return row[mapping.sourceColumn] || '0'
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

  let newCount = 0
  let updCount = 0
  const updates: { store: string; year: number; month: number }[] = []

  for (const row of rawData) {
    const revenue = parseNum(getMapped(row, 'revenue'))
    const quantity = parseIntVal(getMapped(row, 'quantity'))
    const checks = parseIntVal(getMapped(row, 'checks'))
    const grossProfit = parseNum(getMapped(row, 'gross_profit'))
    const year = parseIntVal(getMapped(row, 'year'))
    const month = parseIntVal(getMapped(row, 'month'))
    const store = getMapped(row, 'store') || ''

    if (!year || !month || !store) continue

    const baseData: Record<string, number> = { revenue, quantity, checks, gross_profit: grossProfit }
    const extraData: Record<string, number> = {}

    for (const field of customFactFields) {
      const val = parseNum(getMapped(row, field.key))
      extraData[field.key] = val
      baseData[field.key] = val
    }
    for (const field of calcFields) {
      if (field.formula) {
        const result = evalFormula(field.formula, baseData)
        extraData[field.key] = result
        baseData[field.key] = result
      }
    }

    const data = { revenue, quantity, checks, grossProfit, extraData: Object.keys(extraData).length > 0 ? extraData : undefined, syncedAt: new Date() }

    // Проверяем существует ли запись
    const existing = await prisma.saleRecord.findUnique({ where: { year_month_store: { year, month, store } } })

    await prisma.saleRecord.upsert({
      where: { year_month_store: { year, month, store } },
      update: data,
      create: { year, month, store, ...data },
    })

    if (existing) {
      updCount++
      updates.push({ store, year, month })
    } else {
      newCount++
    }
  }

  await prisma.syncLog.create({
    data: {
      rowsCount: rawData.length,
      newCount,
      updCount,
      status: 'success',
      updates: updates.length > 0 ? updates : undefined,
    }
  })

  return { count: rawData.length, newCount, updCount, updates }
}

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await runSync()
    res.json({ message: 'Synced', ...result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    await prisma.syncLog.create({ data: { rowsCount: 0, newCount: 0, updCount: 0, status: 'error', message } })
    res.status(500).json({ error: message })
  }
})

router.get('/sync/logs', async (req: Request, res: Response) => {
  const logs = await prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 20 })
  res.json(logs)
})

export default router