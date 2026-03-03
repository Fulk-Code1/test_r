import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { fetchSourceColumns } from '../lib/googleSheets'

const router = Router()

const SYSTEM_FIELDS = [
  { key: 'revenue',      label: 'Выручка',        type: 'fact',       dataType: 'number',  formula: null,                          isCustom: false },
  { key: 'gross_profit', label: 'Валовая прибыль', type: 'fact',       dataType: 'number',  formula: null,                          isCustom: false },
  { key: 'checks',       label: 'Кол-во чеков',    type: 'fact',       dataType: 'integer', formula: null,                          isCustom: false },
  { key: 'quantity',     label: 'Количество',       type: 'fact',       dataType: 'integer', formula: null,                          isCustom: false },
  { key: 'margin',       label: 'Маржа, %',         type: 'calculated', dataType: 'percent', formula: 'gross_profit / revenue * 100', isCustom: false },
  { key: 'avg_check',    label: 'Средний чек',      type: 'calculated', dataType: 'number',  formula: 'revenue / checks',            isCustom: false },
  { key: 'fill_rate',    label: 'Наполненность',    type: 'calculated', dataType: 'number',  formula: 'quantity / checks',           isCustom: false },
]

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

router.get('/mapping/system-fields', async (req: Request, res: Response) => {
  const fields = await prisma.systemField.findMany({ include: { mappings: true } })
  res.json(fields)
})

router.get('/mapping/source-columns', async (req: Request, res: Response) => {
  try {
    const columns = await fetchSourceColumns()
    res.json(columns)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/mapping', async (req: Request, res: Response) => {
  const mappings = await prisma.fieldMapping.findMany({ include: { systemField: true } })
  res.json(mappings)
})

router.post('/mapping', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body as { mappings: { sourceColumn: string; systemFieldKey: string }[] }
    await prisma.fieldMapping.deleteMany({})
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

// Создать пользовательское поле
router.post('/mapping/custom-field', async (req: Request, res: Response) => {
  try {
    const { label, type, dataType, formula } = req.body
    if (!label) return res.status(400).json({ error: 'label обязателен' })
    if (type === 'calculated' && !formula) return res.status(400).json({ error: 'formula обязательна для расчётного поля' })

    // Генерируем уникальный key из label
    const key = 'custom_' + label.toLowerCase().replace(/[^a-zа-я0-9]/gi, '_') + '_' + Date.now()

    const field = await prisma.systemField.create({
      data: { key, label, type, dataType: dataType || 'number', formula: formula || null, isCustom: true }
    })
    res.json(field)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Удалить пользовательское поле
router.delete('/mapping/custom-field/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params
    const field = await prisma.systemField.findUnique({ where: { key } })
    if (!field) return res.status(404).json({ error: 'Поле не найдено' })
    if (!field.isCustom) return res.status(403).json({ error: 'Нельзя удалить системное поле' })

    await prisma.fieldMapping.deleteMany({ where: { systemFieldId: field.id } })
    await prisma.systemField.delete({ where: { key } })
    res.json({ message: 'Удалено' })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router