import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { fetchSourceColumns } from '../lib/googleSheets'

const router = Router()

// Системные поля — зашиты в логику приложения
const SYSTEM_FIELDS = [
  { key: 'revenue',      label: 'Выручка',          type: 'fact',       dataType: 'number',  formula: null },
  { key: 'gross_profit', label: 'Валовая прибыль',   type: 'fact',       dataType: 'number',  formula: null },
  { key: 'checks',       label: 'Кол-во чеков',      type: 'fact',       dataType: 'integer', formula: null },
  { key: 'quantity',     label: 'Количество',         type: 'fact',       dataType: 'integer', formula: null },
  { key: 'margin',       label: 'Маржа, %',           type: 'calculated', dataType: 'percent', formula: 'gross_profit / revenue * 100' },
  { key: 'avg_check',    label: 'Средний чек',        type: 'calculated', dataType: 'number',  formula: 'revenue / checks' },
  { key: 'fill_rate',    label: 'Наполненность',      type: 'calculated', dataType: 'number',  formula: 'quantity / checks' },
]

// Инициализация системных полей при старте
export async function initSystemFields() {
  for (const field of SYSTEM_FIELDS) {
    await prisma.systemField.upsert({
      where: { key: field.key },
      update: { label: field.label, type: field.type, dataType: field.dataType, formula: field.formula },
      create: field,
    })
  }
  console.log('System fields initialized')
}

// Получить все системные поля
router.get('/mapping/system-fields', async (req: Request, res: Response) => {
  const fields = await prisma.systemField.findMany({ include: { mappings: true } })
  res.json(fields)
})

// Получить колонки из Google Sheets источника
router.get('/mapping/source-columns', async (req: Request, res: Response) => {
  try {
    const columns = await fetchSourceColumns()
    res.json(columns)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Получить текущий маппинг
router.get('/mapping', async (req: Request, res: Response) => {
  const mappings = await prisma.fieldMapping.findMany({ include: { systemField: true } })
  res.json(mappings)
})

// Сохранить маппинг (принимает массив { sourceColumn, systemFieldKey })
router.post('/mapping', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body as { mappings: { sourceColumn: string; systemFieldKey: string }[] }

    // Удалить старый маппинг
    await prisma.fieldMapping.deleteMany({})

    // Создать новый
    for (const m of mappings) {
      if (!m.sourceColumn || !m.systemFieldKey) continue
      const systemField = await prisma.systemField.findUnique({ where: { key: m.systemFieldKey } })
      if (!systemField) continue
      await prisma.fieldMapping.create({
        data: { sourceColumn: m.sourceColumn, systemFieldId: systemField.id }
      })
    }

    res.json({ message: 'Mapping saved' })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router