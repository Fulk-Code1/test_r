import { google } from 'googleapis'
import path from 'path'

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../../service-account.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

export async function fetchSalesData() {
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.SPREADSHEET_ID!
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sales_Data!A:M', // подстрой под свои колонки
  })
  
  const rows = response.data.values || []
  const headers = rows[0]
  
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h: string, i: number) => { obj[h] = row[i] || '' })
    return obj
  })
}