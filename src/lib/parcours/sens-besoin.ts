// ============================================================
// SENS DU BESOIN, PROVENANCE, PRÉCISION DU LIEU, DOUBLONS.
// Fonctions pures, à partir des seuls champs réellement enregistrés.
// Le type technique « remblai » ne suffit jamais à déduire le sens.
// ============================================================
import type { MySubmission } from "@/lib/parcours/mes-demandes";

export type NeedDirection = "recevoir" | "evacuer" | "acheter" | "a_preciser";

export const NEED_LABELS: Record<NeedDirection, string> = {
  recevoir: "Recevoir du remblai",
  evacuer: "Évacuer des matériaux",
  acheter: "Acheter / se faire livrer des matériaux",
  a_preciser: "Sens à confirmer",
};

const low = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Sens déclaré : direction du parcours et « à livrer / à sortir » doivent concorder. */
export const needDirection = (s: Pick<MySubmission, "requestType" | "parcoursDirection" | "deliverOrRemove">): NeedDirection => {
  const dir = low(s.parcoursDirection);
  const dor = low(s.deliverOrRemove);
  const type = low(s.requestType);
  const fromDir = dir === "reception" ? "in" : dir === "evacuation" ? "out" : null;
  const fromDor = dor.startsWith("a livrer") ? "in" : dor.startsWith("a sortir") ? "out" : null;
  if (fromDir && fromDor && fromDir !== fromDor) return "a_preciser";
  const sens = fromDir ?? fromDor;
  if (!sens) return type === "livraison" ? "acheter" : "a_preciser";
  if (sens === "out") return "evacuer";
  if (type === "remblai") return "recevoir";
  if (type === "vrac" || type === "livraison") return "acheter";
  return "a_preciser";
};

/** Seule une évacuation alimente la recherche d'une dompe. */
export const needsDumpSearch = (d: NeedDirection) => d === "evacuer";

export const VISIBILITY_LABELS: Record<string, string> = {
  compte: "Créée par votre compte",
  affectation: "Affectée à votre entreprise",
  courriel: "Historique associé à votre courriel (non rattaché à l'entreprise)",
};
export const visibilityLabel = (reason: string | null | undefined) =>
  (reason && VISIBILITY_LABELS[reason]) || "Raison de visibilité à confirmer";

export const originLabel = (s: Pick<MySubmission, "creationOrigin" | "leadSource">) => {
  if (s.creationOrigin === "public_form") return "Formulaire public du site";
  if (s.creationOrigin === "manual_admin") return "Saisie par l'administration";
  return s.creationOrigin ? `Origine : ${s.creationOrigin}` : "Origine non enregistrée";
};

const MAP_LINK = /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps)/i;

/** Lieu imprécis : centre approximatif, lien collé ou pas d'adresse précise. */
export const isApproximateLocation = (
  s: Pick<MySubmission, "locationType" | "geocodingStatus" | "address">,
) =>
  low(s.locationType) === "approximate" ||
  low(s.geocodingStatus) === "approximate" ||
  MAP_LINK.test(s.address ?? "");

/** Date d'origine incertaine quand l'horodatage est partagé par un lot. */
export const SHARED_TIMESTAMP_THRESHOLD = 5;
export const originDateNote = (s: Pick<MySubmission, "sharedTimestampCount">) =>
  (s.sharedTimestampCount ?? 0) >= SHARED_TIMESTAMP_THRESHOLD
    ? `Date d'origine inconnue : horodatage commun à ${s.sharedTimestampCount} demandes (probablement un import).`
    : null;

/** Coordonnées utilisables seulement si le lieu est précis. */
export const reliableCoords = (s: MySubmission) =>
  !isApproximateLocation(s) && s.latitude != null && s.longitude != null
    ? { lat: s.latitude, lng: s.longitude }
    : null;

/** Doublons possibles (même adresse ou même lien, même matériau) — signalés, jamais fusionnés. */
export const possibleDuplicates = (subs: MySubmission[]): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  const key = (s: MySubmission) => {
    const a = low(s.address).replace(/[^a-z0-9]+/g, " ").trim();
    return a.length >= 8 ? `${a}|${low(s.material)}` : null;
  };
  for (const s of subs) {
    const k = key(s);
    if (!k) continue;
    const others = subs.filter((o) => o.id !== s.id && key(o) === k).map((o) => (o.number != null ? `#${o.number}` : o.id.slice(0, 8)));
    if (others.length) out.set(s.id, others);
  }
  return out;
};

/** Extrait un point d'un texte : « 46.81, -71.20 » ou lien contenant @lat,lng / q=lat,lng. */
export const parseCoordinates = (text: string): { lat: number; lng: number } | null => {
  const m =
    text.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
    text.match(/[?&](?:q|ll|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
    text.trim().match(/^(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

export const isMapLink = (text: string) => MAP_LINK.test(text);
