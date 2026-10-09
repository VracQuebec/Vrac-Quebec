// Garde-fou de contenu : détecte les affirmations non vérifiables sur
// fournisseurs, partenaires, transport, livraison, disponibilité, proximité,
// délais ou qualité. Pur (sans Deno) pour être testé côté projet.
// Une page qui contient une de ces affirmations n'est jamais enregistrée.

const PATTERNS: Array<[RegExp, string]> = [
  [/\bnos\s+(partenaires|fournisseurs|transporteurs|camionneurs|entrepreneurs)\b/i, "partenaires/fournisseurs revendiqués"],
  [/\b(fournisseurs?|transporteurs?|entrepreneurs?|partenaires?)\s+(locaux|local|de la r[ée]gion|r[ée]gionaux|situ[ée]s?\s+[àa]\s+proximit[ée]|à proximité|pr[èe]s de chez vous)\b/i, "fournisseurs locaux non vérifiés"],
  [/\b(fournisseur|transporteur)\s+local\b/i, "fournisseur local non vérifié"],
  [/\b(livraison|livrons|livrer)\s+(rapide|express|le jour même|en \d+|dans les \d+|sous \d+|garantie)/i, "délai de livraison"],
  [/\b(dans les|en|sous)\s+\d+\s*(h|heures?|jours?)\b/i, "délai chiffré"],
  [/\b(garanti[es]?|garantit|garantissons|certifi[ée]s?|v[ée]rifi[ée]s? par (nos|vrac))\b/i, "garantie/certification"],
  [/\b(normes de qualit[ée] strictes|qualit[ée] sup[ée]rieure|meilleurs? prix|prix comp[ée]titifs?|les plus bas)\b/i, "qualité/prix revendiqués"],
  [/\b(toujours|imm[ée]diatement)\s+disponibles?\b|\bdisponible\s+(imm[ée]diatement|en tout temps|toute l'ann[ée]e)\b/i, "disponibilité"],
  [/\b(nous|on)\s+(livrons|transportons|fournissons|garantissons)\b/i, "service direct revendiqué"],
  [/\b\d+\s*\$|\$\s*\d+/i, "prix"],
  [/\b\d+\s*km\b/i, "distance chiffrée"],
];

export type ClaimHit = { reason: string; excerpt: string };

export function findUnverifiedClaims(html: string): ClaimHit[] {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hits: ClaimHit[] = [];
  for (const [re, reason] of PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      hits.push({ reason, excerpt: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).trim() });
    }
  }
  return hits;
}

export const CONTENT_RULES = `RÈGLES DE VÉRACITÉ (ABSOLUES, prioritaires sur la longueur) :
- N'affirme JAMAIS l'existence de fournisseurs, partenaires, transporteurs ou entrepreneurs locaux, ni leur proximité, leur qualité ou leurs normes.
- N'affirme JAMAIS que la livraison, le transport ou un service est offert, disponible, rapide ou garanti dans la ville. N'écris pas « nous livrons », « nos partenaires », « fournisseur local », « à proximité », « garanti », « certifié ».
- Aucun prix, aucune distance, aucun délai chiffré, aucun quartier, aucune rue, aucun accès camion particulier, aucun règlement local.
- Seuls faits locaux permis : ceux listés dans « Données vérifiées » ci-dessous. Si une donnée manque, n'en parle pas.
- Contenu permis : explications générales et exactes sur le matériau (usages, types, compaction, drainage, préparation du terrain, estimation de volume, questions à se poser), et le fonctionnement de la demande via Vrac Québec (formulaire, analyse de la demande, réponse selon les possibilités réelles).
- Formule les possibilités au conditionnel prudent : « selon les disponibilités confirmées lors de l'analyse de votre demande ».
- Ne remplis pas pour atteindre une longueur : mieux vaut un texte plus court et exact.`;
