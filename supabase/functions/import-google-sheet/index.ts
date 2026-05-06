import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SHEET_ID = '17qJgVMdmVQj5MYeNDP2qQnmz6cBIa4Xc7NrZzo9eMlo'
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4'

function authHeaders() {
  return {
    Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
    'X-Connection-Api-Key': Deno.env.get('GOOGLE_SHEETS_API_KEY')!,
  }
}

async function listSheetTitles(): Promise<string[]> {
  const r = await fetch(`${GATEWAY}/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`Sheet metadata fetch failed ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return (j.sheets || []).map((s: any) => s.properties.title as string)
}

function findTitle(titles: string[], keyword: string): string | null {
  const k = keyword.toLowerCase()
  return titles.find((t) => t.toLowerCase().trim().startsWith(k)) || titles.find((t) => t.toLowerCase().includes(k)) || null
}

function num(v: any): number | null {
  if (v === undefined || v === null || v === '') return null
  const str = String(v).replace(/[^0-9.,-]/g, '').replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}
function s(v: any): string { return v === undefined || v === null ? '' : String(v).trim() }
function splitList(v: any): string[] {
  return s(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean)
}

async function fetchTab(sheetTitle: string) {
  const needsQuotes = /[^A-Za-z0-9_]/.test(sheetTitle)
  const namePart = needsQuotes ? `'${sheetTitle.replace(/'/g, "''")}'` : sheetTitle
  const range = `${namePart}!A1:Z2000`
  const safeRange = range.replace(/ /g, '%20')
  const url = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${safeRange}`
  const r = await fetch(url, { headers: authHeaders() })
  if (!r.ok) throw new Error(`Sheet fetch failed [${sheetTitle}] ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return (j.values || []) as string[][]
}

type RowReport = { row: number; dompe?: string; identifier?: string; reason: string; status: 'inserted' | 'skipped' | 'failed' | 'backfilled' }
type TabReport = { tab: string | null; total: number; inserted: number; skipped: number; failed: number; backfilled: number; rows: RowReport[] }

function emptyReport(tab: string | null): TabReport {
  return { tab, total: 0, inserted: 0, skipped: 0, failed: 0, backfilled: 0, rows: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: roleCheck } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    if (!roleCheck) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const admin = createClient(supabaseUrl, serviceKey)

    const titles = await listSheetTitles()
    const tabClients = findTitle(titles, 'client')
    const tabEntrepreneurs = findTitle(titles, 'entrepreneur')
    const tabPayments = findTitle(titles, 'paiement')
    const tabExpenses = findTitle(titles, 'facture')

    const reports: Record<string, TabReport> = {
      clients: emptyReport(tabClients),
      entrepreneurs: emptyReport(tabEntrepreneurs),
      payments: emptyReport(tabPayments),
      expenses: emptyReport(tabExpenses),
    }
    const globalErrors: string[] = []

    // ========== ENTREPRENEURS ==========
    const repE = reports.entrepreneurs
    try {
      if (!tabEntrepreneurs) throw new Error(`Onglet introuvable. Onglets disponibles: ${titles.join(', ')}`)
      const rows = await fetchTab(tabEntrepreneurs)
      const { data: existing } = await admin.from('entrepreneurs').select('email')
      const existingEmails = new Set((existing || []).map((e) => (e.email || '').toLowerCase()))
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 1
        if (!s(r[0]) && !s(r[1])) continue
        repE.total++
        const ident = s(r[0]) || s(r[1])
        const email = s(r[3]).toLowerCase()
        if (!s(r[0]) && !s(r[1])) { repE.skipped++; repE.rows.push({ row: rowNum, identifier: ident, status: 'skipped', reason: 'Données vides' }); continue }
        if (email && existingEmails.has(email)) { repE.skipped++; repE.rows.push({ row: rowNum, identifier: ident, status: 'skipped', reason: `Doublon (email ${email})` }); continue }
        const payload = {
          name: s(r[0]) || 'Sans nom', company: s(r[1]), phone: s(r[2]), email: s(r[3]),
          address: s(r[4]), truck_types: splitList(r[5]), map_number: s(r[6]),
          truck_count: s(r[7]), notes: s(r[8]),
        }
        const { error } = await admin.from('entrepreneurs').insert(payload)
        if (error) { repE.failed++; repE.rows.push({ row: rowNum, identifier: ident, status: 'failed', reason: error.message }) }
        else { repE.inserted++; if (email) existingEmails.add(email) }
      }
    } catch (e) { globalErrors.push(`entrepreneurs: ${(e as Error).message}`) }

    // ========== CLIENTS (leads → submissions) ==========
    const repC = reports.clients
    try {
      if (!tabClients) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabClients)
      const { data: existing } = await admin.from('submissions').select('id,email,phone,dompe_number')
      const seen = new Set((existing || []).map((e) => `${(e.email || '').toLowerCase()}|${(e.phone || '').replace(/\D/g, '')}`))
      const seenDompe = new Set((existing || []).map((e: any) => (e.dompe_number || '').toLowerCase().trim()).filter(Boolean))
      const byKey = new Map<string, { id: string; dompe_number: string | null }>()
      for (const row of existing || []) {
        const k = `${(row.email || '').toLowerCase()}|${(row.phone || '').replace(/\D/g, '')}`
        if (k !== '|' && !byKey.has(k)) byKey.set(k, { id: row.id, dompe_number: (row as any).dompe_number })
      }
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 1
        if (!s(r[0]) && !s(r[2])) continue
        repC.total++
        const email = s(r[2]); const phone = s(r[1]); const dompe = s(r[5])
        const ident = s(r[0]) || email || phone
        const key = `${email.toLowerCase()}|${phone.replace(/\D/g, '')}`
        if (dompe) {
          const match = byKey.get(key)
          if (match && !(match.dompe_number || '').trim()) {
            const { error } = await admin.from('submissions').update({ dompe_number: dompe }).eq('id', match.id)
            if (error) { repC.failed++; repC.rows.push({ row: rowNum, dompe, identifier: ident, status: 'failed', reason: `Backfill: ${error.message}` }) }
            else { repC.backfilled++; seenDompe.add(dompe.toLowerCase()); repC.rows.push({ row: rowNum, dompe, identifier: ident, status: 'backfilled', reason: 'Numéro DOMPE ajouté à un lead existant' }) }
            continue
          }
        }
        if (dompe && seenDompe.has(dompe.toLowerCase())) { repC.skipped++; repC.rows.push({ row: rowNum, dompe, identifier: ident, status: 'skipped', reason: `Doublon (DOMPE ${dompe} déjà importé)` }); continue }
        if (!dompe && key !== '|' && seen.has(key)) { repC.skipped++; repC.rows.push({ row: rowNum, identifier: ident, status: 'skipped', reason: `Doublon (email/téléphone déjà présent)` }); continue }
        const lat = num(r[12]); const lon = num(r[13])
        const payload = {
          dompe_number: dompe, name: s(r[0]) || 'Sans nom', phone, email: email || 'no-email@import.local',
          address: s(r[3]) || s(r[4]), postal_code: s(r[4]),
          materials: splitList(r[6]).length ? splitList(r[6]) : ['Autre'],
          quantity: s(r[7]), accessibility: splitList(r[8]),
          machinery_available: /oui|yes|tracteur|pelle|bobcat|mini/i.test(s(r[9])) && !/aucune/i.test(s(r[9])),
          machinery_description: s(r[9]), budget_max: s(r[10]),
          internal_notes: s(r[11]) ? `[Import Google Sheet${dompe ? ' - ' + dompe : ''}] ${s(r[11])}` : `[Import Google Sheet${dompe ? ' - ' + dompe : ''}]`,
          latitude: lat, longitude: lon, property_type: 'résidentiel', tonnage: '',
          request_type: 'livraison', status: 'nouveau', visible_to_entrepreneur: true,
        }
        const { error } = await admin.from('submissions').insert(payload)
        if (error) { repC.failed++; repC.rows.push({ row: rowNum, dompe, identifier: ident, status: 'failed', reason: error.message }) }
        else { repC.inserted++; seen.add(key); if (dompe) seenDompe.add(dompe.toLowerCase()) }
      }
    } catch (e) { globalErrors.push(`clients: ${(e as Error).message}`) }

    // ========== PAYMENTS ==========
    const repP = reports.payments
    try {
      if (!tabPayments) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabPayments)
      const { data: existing } = await admin.from('payments').select('delivery_date,client_name,map_point')
      const seen = new Set((existing || []).map((e) => `${e.delivery_date}|${e.client_name}|${e.map_point}`))
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 1
        if (!s(r[0]) && !s(r[2])) continue
        repP.total++
        const ident = s(r[2]) || s(r[0])
        const key = `${s(r[0])}|${s(r[2])}|${s(r[1])}`
        if (seen.has(key)) { repP.skipped++; repP.rows.push({ row: rowNum, identifier: ident, status: 'skipped', reason: 'Doublon (date+client+map déjà présent)' }); continue }
        const payload = {
          delivery_date: s(r[0]), map_point: s(r[1]), client_name: s(r[2]), client_phone: s(r[3]),
          client_email: s(r[4]), client_address: s(r[5]), material: s(r[6]), trips: s(r[7]),
          price_sold: num(r[8]), charged_to_entrepreneur: num(r[9]), total: num(r[10]),
          entrepreneur_invoiced: s(r[11]), client_invoiced: s(r[12]), client_payment_date: s(r[13]),
          client_confirmation: s(r[14]), entrepreneur_payment_date: s(r[15]),
          entrepreneur_confirmation: s(r[16]), notes: s(r[17]),
        }
        const { error } = await admin.from('payments').insert(payload)
        if (error) { repP.failed++; repP.rows.push({ row: rowNum, identifier: ident, status: 'failed', reason: error.message }) }
        else { repP.inserted++; seen.add(key) }
      }
    } catch (e) { globalErrors.push(`payments: ${(e as Error).message}`) }

    // ========== EXPENSES ==========
    const repX = reports.expenses
    try {
      if (!tabExpenses) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabExpenses)
      const { data: existing } = await admin.from('expenses').select('expense_date,invoice_number,category')
      const seen = new Set((existing || []).map((e) => `${e.category}|${e.expense_date}|${e.invoice_number}`))
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 1
        const groups: { cat: 'fournitures' | 'gaz'; payload: any; ident: string }[] = []
        if (s(r[0]) && s(r[1])) groups.push({ cat: 'fournitures', ident: `${s(r[1])} ${s(r[2])}`, payload: { category: 'fournitures', expense_date: s(r[0]), company: s(r[1]), invoice_number: s(r[2]), tps: num(r[3]), tvq: num(r[4]), fees: num(r[5]), amount_before_tax: num(r[6]), amount_total: num(r[7]) } })
        if (s(r[9]) && s(r[10])) groups.push({ cat: 'gaz', ident: `${s(r[10])} ${s(r[11])}`, payload: { category: 'gaz', expense_date: s(r[9]), company: s(r[10]), invoice_number: s(r[11]), tps: num(r[12]), tvq: num(r[13]), amount_before_tax: num(r[14]), amount_total: num(r[15]) } })
        for (const g of groups) {
          repX.total++
          const k = `${g.cat}|${g.payload.expense_date}|${g.payload.invoice_number}`
          if (seen.has(k)) { repX.skipped++; repX.rows.push({ row: rowNum, identifier: `[${g.cat}] ${g.ident}`, status: 'skipped', reason: 'Doublon (catégorie+date+facture)' }); continue }
          const { error } = await admin.from('expenses').insert(g.payload)
          if (error) { repX.failed++; repX.rows.push({ row: rowNum, identifier: `[${g.cat}] ${g.ident}`, status: 'failed', reason: error.message }) }
          else { repX.inserted++; seen.add(k) }
        }
      }
    } catch (e) { globalErrors.push(`expenses: ${(e as Error).message}`) }

    // Legacy summary fields kept for backward compat
    const result = {
      clients: repC.inserted,
      entrepreneurs: repE.inserted,
      payments: repP.inserted,
      expenses: repX.inserted,
      skipped: repC.skipped + repE.skipped + repP.skipped + repX.skipped,
      errors: globalErrors,
      tabs: { clients: tabClients, entrepreneurs: tabEntrepreneurs, payments: tabPayments, expenses: tabExpenses },
      report: reports,
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
