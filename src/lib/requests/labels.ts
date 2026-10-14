// Présentation seulement : les identifiants techniques (request_number « DT-0053 »,
// dompe_number « Dompe 926 ») restent inchangés en base. Une demande administrative
// ne doit jamais être présentée comme une dompe, et inversement.

const DT_RE = /^\s*DT-?(\d+)\s*$/i;

/** « DT-0053 » → « Demande #0053 ». Valeur inconnue → « Demande #<valeur> ». */
export function formatRequestLabel(raw: string | null | undefined, fallback = "—"): string {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  const m = v.match(DT_RE);
  return `Demande #${m ? m[1] : v.replace(/^#/, "")}`;
}

/** « Dompe 926 » / « 926 » → « Dompe #926 ». Vide → null (ne jamais substituer le numéro de demande). */
export function formatDompeLabel(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/^(?:dompe\s*#?\s*)?(\d+)$/i);
  return m ? `Dompe #${m[1]}` : v;
}

/** Remplace les références « DT-0053 » dans un texte libre (notifications, historiques). */
export function humanizeRequestRefs<T extends string | null | undefined>(text: T): T {
  if (!text) return text;
  return text.replace(/\bDT-(\d{2,})\b/g, "Demande #$1") as T;
}

/** Texte de recherche : accepte « DT-0053 », « 0053 », « #0053 », « demande #0053 ». */
export function requestSearchText(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return `${v} ${formatRequestLabel(v)}`;
}
