import { google } from 'googleapis'
import path from 'path'

export async function fetchSalesData(): Promise<Record<string, string>[]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.SPREADSHEET_ID!

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sales_Data!A:F',
  })

  const rows = response.data.values
  if (!rows || rows.length < 2) return []

  const headers = rows[0]
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj
  })
}