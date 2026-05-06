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
  const s = String(v).replace(/[^0-9.,-]/g, '').replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}
function s(v: any): string { return v === undefined || v === null ? '' : String(v).trim() }
function splitList(v: any): string[] {
  return s(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean)
}

async function fetchTab(sheetTitle: string) {
  // Wrap in single quotes; double any internal single quotes (per Sheets A1 grammar)
  const quoted = `'${sheetTitle.replace(/'/g, "''")}'`
  const range = `${quoted}!A1:Z2000`
  // Encode only the path segment (preserves !, : as path-safe per Google rules) — encode quotes & spaces only
  const safeRange = range.replace(/'/g, '%27').replace(/ /g, '%20')
  const url = `${GATEWAY}/spreadsheets/${SHEET_ID}/values/${safeRange}`
  const r = await fetch(url, { headers: authHeaders() })
  if (!r.ok) throw new Error(`Sheet fetch failed [${sheetTitle}] ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return (j.values || []) as string[][]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: roleCheck } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    if (!roleCheck) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const admin = createClient(supabaseUrl, serviceKey)
    const result = { clients: 0, entrepreneurs: 0, payments: 0, expenses: 0, skipped: 0, errors: [] as string[], tabs: {} as Record<string, string | null> }

    const titles = await listSheetTitles()
    const tabClients = findTitle(titles, 'client')
    const tabEntrepreneurs = findTitle(titles, 'entrepreneur')
    const tabPayments = findTitle(titles, 'paiement')
    const tabExpenses = findTitle(titles, 'facture')
    result.tabs = { clients: tabClients, entrepreneurs: tabEntrepreneurs, payments: tabPayments, expenses: tabExpenses }

    // ========== ENTREPRENEURS ==========
    try {
      if (!tabEntrepreneurs) throw new Error(`Onglet introuvable. Onglets disponibles: ${titles.join(', ')}`)
      const rows = await fetchTab(tabEntrepreneurs)
      const data = rows.slice(1).filter((r) => s(r[0]) || s(r[1]))
      // dedupe by email
      const { data: existing } = await admin.from('entrepreneurs').select('email')
      const existingEmails = new Set((existing || []).map((e) => (e.email || '').toLowerCase()))
      const toInsert = []
      for (const r of data) {
        const email = s(r[3]).toLowerCase()
        if (email && existingEmails.has(email)) { result.skipped++; continue }
        toInsert.push({
          name: s(r[0]) || 'Sans nom',
          company: s(r[1]),
          phone: s(r[2]),
          email: s(r[3]),
          address: s(r[4]),
          truck_types: splitList(r[5]),
          map_number: s(r[6]),
          truck_count: s(r[7]),
          notes: s(r[8]),
        })
        if (email) existingEmails.add(email)
      }
      if (toInsert.length) {
        const { error } = await admin.from('entrepreneurs').insert(toInsert)
        if (error) result.errors.push(`entrepreneurs: ${error.message}`)
        else result.entrepreneurs = toInsert.length
      }
    } catch (e) { result.errors.push(`entrepreneurs: ${(e as Error).message}`) }

    // ========== CLIENTS (leads → submissions) ==========
    try {
      if (!tabClients) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabClients)
      const data = rows.slice(1).filter((r) => s(r[0]) || s(r[2]))
      const { data: existing } = await admin.from('submissions').select('email,phone')
      const seen = new Set((existing || []).map((e) => `${(e.email || '').toLowerCase()}|${(e.phone || '').replace(/\D/g, '')}`))
      const toInsert = []
      for (const r of data) {
        const email = s(r[2])
        const phone = s(r[1])
        const key = `${email.toLowerCase()}|${phone.replace(/\D/g, '')}`
        if (key !== '|' && seen.has(key)) { result.skipped++; continue }
        const lat = num(r[12]); const lon = num(r[13])
        toInsert.push({
          name: s(r[0]) || 'Sans nom',
          phone,
          email: email || 'no-email@import.local',
          address: s(r[3]) || s(r[4]),
          postal_code: s(r[4]),
          materials: splitList(r[6]).length ? splitList(r[6]) : ['Autre'],
          quantity: s(r[7]),
          accessibility: splitList(r[8]),
          machinery_available: /oui|yes|tracteur|pelle|bobcat|mini/i.test(s(r[9])) && !/aucune/i.test(s(r[9])),
          machinery_description: s(r[9]),
          budget_max: s(r[10]),
          internal_notes: s(r[11]) ? `[Import Google Sheet] ${s(r[11])}` : '[Import Google Sheet]',
          latitude: lat,
          longitude: lon,
          property_type: 'résidentiel',
          tonnage: '',
          request_type: 'livraison',
          status: 'nouveau',
          visible_to_entrepreneur: true,
        })
        seen.add(key)
      }
      if (toInsert.length) {
        const { error } = await admin.from('submissions').insert(toInsert)
        if (error) result.errors.push(`clients: ${error.message}`)
        else result.clients = toInsert.length
      }
    } catch (e) { result.errors.push(`clients: ${(e as Error).message}`) }

    // ========== PAYMENTS ==========
    try {
      if (!tabPayments) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabPayments)
      const data = rows.slice(1).filter((r) => s(r[0]) || s(r[2]))
      const { data: existing } = await admin.from('payments').select('delivery_date,client_name,map_point')
      const seen = new Set((existing || []).map((e) => `${e.delivery_date}|${e.client_name}|${e.map_point}`))
      const toInsert = []
      for (const r of data) {
        const key = `${s(r[0])}|${s(r[2])}|${s(r[1])}`
        if (seen.has(key)) { result.skipped++; continue }
        toInsert.push({
          delivery_date: s(r[0]),
          map_point: s(r[1]),
          client_name: s(r[2]),
          client_phone: s(r[3]),
          client_email: s(r[4]),
          client_address: s(r[5]),
          material: s(r[6]),
          trips: s(r[7]),
          price_sold: num(r[8]),
          charged_to_entrepreneur: num(r[9]),
          total: num(r[10]),
          entrepreneur_invoiced: s(r[11]),
          client_invoiced: s(r[12]),
          client_payment_date: s(r[13]),
          client_confirmation: s(r[14]),
          entrepreneur_payment_date: s(r[15]),
          entrepreneur_confirmation: s(r[16]),
          notes: s(r[17]),
        })
        seen.add(key)
      }
      if (toInsert.length) {
        const { error } = await admin.from('payments').insert(toInsert)
        if (error) result.errors.push(`payments: ${error.message}`)
        else result.payments = toInsert.length
      }
    } catch (e) { result.errors.push(`payments: ${(e as Error).message}`) }

    // ========== EXPENSES (Factures 2025) ==========
    // Two columns groups: Fournitures (A-H) and Gaz (J-P starting at col J=index 9)
    try {
      if (!tabExpenses) throw new Error(`Onglet introuvable. Onglets: ${titles.join(', ')}`)
      const rows = await fetchTab(tabExpenses)
      const toInsert: any[] = []
      // Skip first 2 header rows
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i]
        // Fournitures group: A-H
        if (s(r[0]) && s(r[1])) {
          toInsert.push({
            category: 'fournitures',
            expense_date: s(r[0]),
            company: s(r[1]),
            invoice_number: s(r[2]),
            tps: num(r[3]),
            tvq: num(r[4]),
            fees: num(r[5]),
            amount_before_tax: num(r[6]),
            amount_total: num(r[7]),
          })
        }
        // Gaz group: J-P (index 9..15)
        if (s(r[9]) && s(r[10])) {
          toInsert.push({
            category: 'gaz',
            expense_date: s(r[9]),
            company: s(r[10]),
            invoice_number: s(r[11]),
            tps: num(r[12]),
            tvq: num(r[13]),
            amount_before_tax: num(r[14]),
            amount_total: num(r[15]),
          })
        }
      }
      // dedupe vs existing
      const { data: existing } = await admin.from('expenses').select('expense_date,invoice_number,category')
      const seen = new Set((existing || []).map((e) => `${e.category}|${e.expense_date}|${e.invoice_number}`))
      const filtered = toInsert.filter((x) => {
        const k = `${x.category}|${x.expense_date}|${x.invoice_number}`
        if (seen.has(k)) { result.skipped++; return false }
        seen.add(k); return true
      })
      if (filtered.length) {
        const { error } = await admin.from('expenses').insert(filtered)
        if (error) result.errors.push(`expenses: ${error.message}`)
        else result.expenses = filtered.length
      }
    } catch (e) { result.errors.push(`expenses: ${(e as Error).message}`) }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})