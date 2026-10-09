// Garde-fou de contenu : détecte les affirmations non vérifiables sur
// fournisseurs, partenaires, transport, livraison, disponibilité, proximité,
// délais ou qualité. Pur (sans Deno) pour être testé côté projet.
// Une page qui contient une de ces affirmations n'est jamais enregistrée.

const PATTERNS: Array<[RegExp, string]> = [
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))nos\s+(partenaires|fournisseurs|transporteurs|camionneurs|entrepreneurs)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "partenaires/fournisseurs revendiqués"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(fournisseurs?|transporteurs?|entrepreneurs?|partenaires?)\s+(locaux|local|de la r[ée]gion|r[ée]gionaux|situ[ée]s?\s+[àa]\s+proximit[ée]|à proximité|pr[èe]s de chez vous)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "fournisseurs locaux non vérifiés"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(fournisseur|transporteur)\s+local(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "fournisseur local non vérifié"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(livraison|livrons|livrer)\s+(rapide|express|le jour même|en \d+|dans les \d+|sous \d+|garantie)/iu, "délai de livraison"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(dans les|en|sous)\s+\d+\s*(h|heures?|jours?)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "délai chiffré"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(garanti[es]?|garantissons|certifi[ée]s?|v[ée]rifi[ée]s? par (nos|vrac))(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "garantie/certification"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(normes de qualit[ée] strictes|qualit[ée] sup[ée]rieure|meilleurs? prix|prix comp[ée]titifs?|les plus bas)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "qualité/prix revendiqués"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(toujours|imm[ée]diatement)\s+disponibles?(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))|(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))disponible\s+(imm[ée]diatement|en tout temps|toute l'ann[ée]e)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "disponibilité"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))(nous|on)\s+(livrons|transportons|fournissons|garantissons)(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "service direct revendiqué"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))\d+\s*\$|\$\s*\d+/iu, "prix"],
  [/(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))\d+\s*km(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))/iu, "distance chiffrée"],
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
