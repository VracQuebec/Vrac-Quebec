import { createClient } from 'npm:@supabase/supabase-js@2'

// Função TEMPORÁRIA de verificação EXEC-01: remove apenas o arquivo fictício
// criado para o essaio de nettoyage. Será apagada em seguida.
const PATH = 'submissions/11111111-2222-4333-8444-555555555555/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.png'

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await db.storage.from('lead-photos').remove([PATH])
  const { data: rest } = await db.storage.from('lead-photos').list('submissions/11111111-2222-4333-8444-555555555555')
  return new Response(JSON.stringify({ removed: data, error: error?.message ?? null, restantes: rest?.map((f: { name: string }) => f.name) ?? [] }), { headers: { 'Content-Type': 'application/json' } })
})
