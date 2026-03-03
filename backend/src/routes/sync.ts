import { Router, Request, Response } from 'express'
import { fetchSalesData } from '../lib/googleSheets'
import { prisma } from '../lib/prisma'

const router = Router()

const parseNum = (v: string) => parseFloat((v || '0').replace(/,/g, ''))
const parseIntVal = (v: string) => parseInt((v || '0').replace(/,/g, ''), 10)

function evalFormula(formula: string, data: Record<string, number>): number {
  let expr = formula
  for (const [key, val] of Object.entries(data)) {
    expr = expr.replace(new RegExp(key, 'g'), String(val || 0))
  }
  try {
    return Function('"use strict"; return (' + expr + ')')()
  } catch { return 0 }
}

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const rawData = await fetchSalesData()

    // Загружаем маппинг и все системные поля из БД
    const mappings = await prisma.fieldMapping.findMany({ include: { systemField: true } })
    const calcFields = await prisma.systemField.findMany({ where: { type: 'calculated' } })

    if (mappings.length === 0) {
      return res.status(400).json({ error: 'Маппинг не настроен. Настройте маппинг полей перед синхронизацией.' })
    }

    // Находим колонки для year, month, store по названию
    const findCol = (keywords: string[]) => {
      for (const m of mappings) {
        if (keywords.some(k => m.sourceColumn.toLowerCase().includes(k))) return m.sourceColumn
      }
      return null
    }
    const yearCol = findCol(['year', 'год'])
    const monthCol = findCol(['month', 'месяц'])
    const storeCol = findCol(['store', 'магазин'])

    const records = rawData.map(row => {
      const data: Record<string, number> = {}

      // Применяем маппинг фактических полей
      for (const mapping of mappings) {
        const rawVal = row[mapping.sourceColumn] || '0'
        const field = mapping.systemField
        if (field.dataType === 'integer') {
          data[field.key] = parseIntVal(rawVal)
        } else {
          data[field.key] = parseNum(rawVal)
        }
      }

      // Вычисляем расчётные поля
      for (const field of calcFields) {
        if (field.formula) {
          data[field.key] = evalFormula(field.formula, data)
        }
      }

      return {
        year: yearCol ? parseIntVal(row[yearCol]) : 0,
        month: monthCol ? parseIntVal(row[monthCol]) : 0,
        store: storeCol ? (row[storeCol] || '') : '',
        data,
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