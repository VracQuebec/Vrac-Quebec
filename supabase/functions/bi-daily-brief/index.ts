// Deno edge function — Deterministic executive daily brief (no AI).
// Builds a French markdown briefing entirely from the metrics payload.
// Zero LOVABLE_API_KEY usage: the brief is a template driven by real numbers.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Num = number | null | undefined;

function n(v: Num): number { return typeof v === 'number' && isFinite(v) ? v : 0; }
function fmt(v: Num): string { return n(v).toLocaleString('fr-CA'); }
function fmtMoney(v: Num): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n(v));
}
function pct(cur: Num, prev: Num): { text: string; sign: 'up' | 'down' | 'flat' } {
  const c = n(cur), p = n(prev);
  if (p === 0 && c === 0) return { text: '±0 %', sign: 'flat' };
  if (p === 0) return { text: '+∞ %', sign: 'up' };
  const d = ((c - p) / Math.abs(p)) * 100;
  const rounded = Math.round(d * 10) / 10;
  if (Math.abs(rounded) < 0.5) return { text: '±0 %', sign: 'flat' };
  return { text: `${rounded > 0 ? '+' : ''}${rounded} %`, sign: rounded > 0 ? 'up' : 'down' };
}

function bulletsFrom<T extends { name?: string; count?: number }>(rows: T[] | undefined, unit = ''): string[] {
  return (rows ?? []).slice(0, 5).map((r) => `- **${r.name ?? '—'}** — ${fmt(r.count)}${unit}`);
}

function buildBrief(m: Record<string, unknown>): string {
  const periode = String(m.periode ?? 'période courante');
  const demandes = (m.demandes ?? {}) as Record<string, Num>;
  const transport = (m.transport ?? {}) as { demandes?: Num; precedent?: Num; statut?: { done?: Num; pending?: Num; in_progress?: Num } };
  const revenus = (m.revenus ?? {}) as { periode?: Num; precedent?: Num };
  const seo = (m.seo ?? {}) as {
    conversions?: Num; conversions_precedent?: Num; cta_clicks?: Num;
    top_pages?: Array<{ titre: string; conversions: number }>;
    opportunites?: Array<{ titre: string; impressions: number; position: number }>;
  };
  const topVilles = (m.top_villes ?? []) as Array<{ name?: string; count?: number }>;
  const topMateriaux = (m.top_materiaux ?? []) as Array<{ name?: string; count?: number }>;
  const topDompes = (m.top_dompes ?? []) as Array<{ name?: string; count?: number }>;
  const sousExploites = (m.secteurs_sous_exploites ?? []) as Array<{ name?: string; count?: number }>;
  const combiManquantes = (m.combinaisons_manquantes ?? []) as Array<{ ville?: string; materiau?: string }>;

  const dPeriode = pct(demandes.periode, demandes.precedent);
  const dTransport = pct(transport.demandes, transport.precedent);
  const dRevenus = pct(revenus.periode, revenus.precedent);
  const dSeoConv = pct(seo.conversions, seo.conversions_precedent);

  const monte: string[] = [];
  const inquiete: string[] = [];
  const pushTrend = (label: string, current: string, delta: { text: string; sign: 'up' | 'down' | 'flat' }) => {
    const line = `- **${label}** : ${current} (${delta.text} vs période précédente)`;
    if (delta.sign === 'up') monte.push(line);
    else if (delta.sign === 'down') inquiete.push(line);
  };
  pushTrend('Demandes reçues', fmt(demandes.periode), dPeriode);
  pushTrend('Demandes de transport', fmt(transport.demandes), dTransport);
  pushTrend('Revenus facturés', fmtMoney(revenus.periode), dRevenus);
  pushTrend('Conversions SEO', fmt(seo.conversions), dSeoConv);

  const conversionRate = n(m.conversion_pct);
  if (conversionRate < 25 && n(demandes.periode) > 0) {
    inquiete.push(`- **Taux de conversion faible** : ${conversionRate} % (< 25 %) — les demandes reçues ne sont pas toutes assignées à un entrepreneur.`);
  }
  if (n(transport.statut?.pending) > n(transport.statut?.done)) {
    inquiete.push(`- **File transport chargée** : ${fmt(transport.statut?.pending)} en attente vs ${fmt(transport.statut?.done)} terminées.`);
  }

  const actions: string[] = [];
  if (combiManquantes.length > 0) {
    const s = combiManquantes.slice(0, 3).map((c) => `${c.materiau ?? '—'} × ${c.ville ?? '—'}`).join(', ');
    actions.push(`1. **Créer les pages SEO manquantes** : ${s}.`);
  }
  if ((seo.opportunites ?? []).length > 0) {
    const first = seo.opportunites![0];
    actions.push(`2. **Optimiser « ${first.titre} »** — ${fmt(first.impressions)} impressions à la position moyenne ${first.position?.toFixed?.(1) ?? first.position}. Un renforcement peut la faire passer sous la barre du top 10.`);
  }
  if (sousExploites.length > 0) {
    const s = sousExploites.slice(0, 3).map((r) => r.name).filter(Boolean).join(', ');
    actions.push(`3. **Prospecter en zone sous-exploitée** : ${s}.`);
  }
  if (topDompes.length > 0) {
    actions.push(`4. **Confirmer la disponibilité** des dompes les plus sollicitées (${topDompes.slice(0, 3).map((r) => r.name).filter(Boolean).join(', ')}).`);
  }
  if (n(seo.cta_clicks) > 0 && n(seo.conversions) === 0) {
    actions.push(`5. **Diagnostiquer la conversion SEO** : ${fmt(seo.cta_clicks)} clics CTA mais 0 conversion — vérifier le formulaire cible.`);
  }
  if (actions.length === 0) {
    actions.push('1. **Continuer la génération de pages SEO** en priorisant les villes à forte population encore non couvertes.');
    actions.push('2. **Relancer les demandes en attente** de plus de 24 h.');
  }

  const opportunites: string[] = [];
  if (topVilles.length > 0) opportunites.push(`- Villes les plus actives : ${topVilles.slice(0, 5).map((r) => `**${r.name}** (${fmt(r.count)})`).join(', ')}.`);
  if (topMateriaux.length > 0) opportunites.push(`- Matériaux les plus demandés : ${topMateriaux.slice(0, 5).map((r) => `**${r.name}** (${fmt(r.count)})`).join(', ')}.`);
  if ((seo.top_pages ?? []).length > 0) opportunites.push(`- Meilleures pages SEO : ${seo.top_pages!.slice(0, 3).map((p) => `**${p.titre}** (${fmt(p.conversions)} conv.)`).join(', ')}.`);

  const resume = [
    `${fmt(demandes.periode)} demandes reçues sur ${periode} (${dPeriode.text}), ${fmt(transport.demandes)} demandes de transport (${dTransport.text}), ${fmtMoney(revenus.periode)} facturés (${dRevenus.text}).`,
    `Taux de conversion actuel : ${conversionRate} %. ${fmt(seo.conversions)} conversions issues du SEO (${dSeoConv.text}).`,
  ].join(' ');

  const sections: string[] = [];
  sections.push(`**Résumé** — ${resume}`);
  sections.push(`**Ce qui monte**\n${monte.length ? monte.join('\n') : '- Aucune variation positive significative détectée.'}`);
  sections.push(`**Ce qui inquiète**\n${inquiete.length ? inquiete.join('\n') : '- Aucun signal négatif majeur.'}`);
  sections.push(`**Actions du jour**\n${actions.join('\n')}`);
  if (opportunites.length) sections.push(`**Opportunités**\n${opportunites.join('\n')}`);
  if (topVilles.length) sections.push(`**Top villes (${periode})**\n${bulletsFrom(topVilles, ' demandes').join('\n')}`);
  if (topMateriaux.length) sections.push(`**Top matériaux (${periode})**\n${bulletsFrom(topMateriaux, ' demandes').join('\n')}`);

  return sections.join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await authed.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(url, service);
    const { data: roleData } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').eq('approved', true).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Accès admin requis' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { metrics } = await req.json().catch(() => ({ metrics: {} }));
    const brief = buildBrief((metrics ?? {}) as Record<string, unknown>);
    return new Response(JSON.stringify({ brief, ai: false, engine: 'deterministic-v1' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});