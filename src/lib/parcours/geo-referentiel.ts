// ============================================================
// RÉFÉRENTIEL GÉOGRAPHIQUE DÉTERMINISTE — LECTURE SEULE.
// Objectif unique : normaliser `ville + province` puis, lorsque la
// correspondance est CERTAINE, rattacher une région administrative.
// Aucune approximation, aucun rapprochement flou, aucune proximité
// géographique, aucune coordonnée, aucune distance.
// Ce fichier ne contient AUCUNE donnée privée (adresse, code postal
// complet, identifiant, courriel, téléphone).
// ============================================================

/** Clé de comparaison : minuscules, sans accents, espaces/tirets unifiés. */
export const geoKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[\s\-_]+/g, " ")
    .trim();

// ------------------------------------------------------------
// PROVINCES — codes et libellés officiels.
// ------------------------------------------------------------
export interface ProvinceRef {
  /** Code postal officiel à deux lettres (ex. « QC »). */
  code: string;
  /** Nom officiel en français (ex. « Québec »). */
  name: string;
}

const PROVINCE_LIST: Array<ProvinceRef & { aliases: string[] }> = [
  { code: "QC", name: "Québec", aliases: ["qc", "quebec", "province de quebec", "pq"] },
  { code: "ON", name: "Ontario", aliases: ["on", "ont", "ontario"] },
  { code: "NB", name: "Nouveau-Brunswick", aliases: ["nb", "nouveau brunswick", "new brunswick"] },
  { code: "NS", name: "Nouvelle-Écosse", aliases: ["ns", "nouvelle ecosse", "nova scotia"] },
  { code: "PE", name: "Île-du-Prince-Édouard", aliases: ["pe", "pei", "ile du prince edouard", "prince edward island"] },
  { code: "NL", name: "Terre-Neuve-et-Labrador", aliases: ["nl", "terre neuve et labrador", "newfoundland and labrador"] },
  { code: "MB", name: "Manitoba", aliases: ["mb", "manitoba"] },
  { code: "SK", name: "Saskatchewan", aliases: ["sk", "saskatchewan"] },
  { code: "AB", name: "Alberta", aliases: ["ab", "alberta"] },
  { code: "BC", name: "Colombie-Britannique", aliases: ["bc", "cb", "colombie britannique", "british columbia"] },
  { code: "YT", name: "Yukon", aliases: ["yt", "yukon"] },
  { code: "NT", name: "Territoires du Nord-Ouest", aliases: ["nt", "territoires du nord ouest", "northwest territories"] },
  { code: "NU", name: "Nunavut", aliases: ["nu", "nunavut"] },
];

const PROVINCE_INDEX: Record<string, ProvinceRef> = (() => {
  const idx: Record<string, ProvinceRef> = {};
  for (const p of PROVINCE_LIST) {
    const ref: ProvinceRef = { code: p.code, name: p.name };
    idx[geoKey(p.code)] = ref;
    idx[geoKey(p.name)] = ref;
    for (const a of p.aliases) idx[geoKey(a)] = ref;
  }
  return idx;
})();

/** Province normalisée, ou null si non déterminable avec certitude. */
export const resolveProvince = (value: unknown): ProvinceRef | null => {
  if (typeof value !== "string") return null;
  const k = geoKey(value);
  if (!k) return null;
  return PROVINCE_INDEX[k] ?? null;
};

// ------------------------------------------------------------
// VILLES DU QUÉBEC → RÉGION ADMINISTRATIVE OFFICIELLE.
// Liste volontairement limitée aux municipalités dont le rattachement
// est certain. Une ville absente reste valable comme ville, mais sa
// région demeure `null` (jamais devinée).
// ------------------------------------------------------------
const QC_REGIONS: Record<string, string[]> = {
  "Bas-Saint-Laurent": ["Rimouski", "Rivière-du-Loup", "Matane", "Amqui", "Mont-Joli", "Trois-Pistoles"],
  "Saguenay–Lac-Saint-Jean": ["Saguenay", "Chicoutimi", "Jonquière", "Alma", "Dolbeau-Mistassini", "Roberval", "Saint-Félicien"],
  "Capitale-Nationale": ["Québec", "Beauport", "Charlesbourg", "Sainte-Foy", "Sillery", "Loretteville", "L'Ancienne-Lorette", "Saint-Augustin-de-Desmaures", "Stoneham-et-Tewkesbury", "Boischatel", "Château-Richer", "Baie-Saint-Paul", "Donnacona", "Pont-Rouge", "Saint-Raymond", "Shannon", "Lac-Beauport"],
  "Mauricie": ["Trois-Rivières", "Shawinigan", "Louiseville", "La Tuque", "Bécancour"],
  "Estrie": ["Sherbrooke", "Magog", "Granby", "Coaticook", "Windsor", "Cowansville", "Lac-Mégantic"],
  "Montréal": ["Montréal", "Westmount", "Montréal-Nord", "Lachine", "LaSalle", "Verdun", "Saint-Laurent", "Anjou", "Outremont", "Pierrefonds", "Dorval", "Côte-Saint-Luc", "Mont-Royal"],
  "Outaouais": ["Gatineau", "Hull", "Aylmer", "Buckingham", "Maniwaki", "Thurso"],
  "Abitibi-Témiscamingue": ["Rouyn-Noranda", "Val-d'Or", "Amos", "La Sarre", "Ville-Marie", "Malartic"],
  "Côte-Nord": ["Baie-Comeau", "Sept-Îles", "Port-Cartier", "Forestville", "Havre-Saint-Pierre"],
  "Nord-du-Québec": ["Chibougamau", "Chapais", "Matagami", "Radisson"],
  "Gaspésie–Îles-de-la-Madeleine": ["Gaspé", "Chandler", "Percé", "Carleton-sur-Mer", "Sainte-Anne-des-Monts", "Les Îles-de-la-Madeleine"],
  "Chaudière-Appalaches": ["Lévis", "Saint-Nicolas", "Saint-Romuald", "Charny", "Saint-Georges", "Thetford Mines", "Montmagny", "Sainte-Marie", "Saint-Joseph-de-Beauce", "Beauceville", "Lac-Etchemin", "Saint-Apollinaire", "Sainte-Croix", "Saint-Henri", "Saint-Lambert-de-Lauzon", "Saint-Agapit"],
  "Laval": ["Laval", "Chomedey", "Sainte-Rose", "Duvernay"],
  "Lanaudière": ["Repentigny", "Terrebonne", "Mascouche", "Joliette", "L'Assomption", "Rawdon", "Saint-Charles-Borromée", "Berthierville"],
  "Laurentides": ["Saint-Jérôme", "Blainville", "Boisbriand", "Sainte-Thérèse", "Mirabel", "Saint-Sauveur", "Sainte-Adèle", "Mont-Tremblant", "Sainte-Agathe-des-Monts", "Deux-Montagnes", "Saint-Eustache"],
  "Montérégie": ["Longueuil", "Brossard", "Saint-Hubert", "Boucherville", "Saint-Bruno-de-Montarville", "Saint-Jean-sur-Richelieu", "Saint-Hyacinthe", "Sorel-Tracy", "Salaberry-de-Valleyfield", "Châteauguay", "Vaudreuil-Dorion", "Beloeil", "Chambly", "Candiac", "La Prairie", "Varennes", "Sainte-Julie", "Saint-Constant", "Marieville"],
  "Centre-du-Québec": ["Drummondville", "Victoriaville", "Nicolet", "Plessisville", "Warwick"],
};

export interface CityRef {
  /** Nom officiel de la municipalité (casse et accents corrects). */
  name: string;
  /** Code de province (« QC » pour ce référentiel). */
  provinceCode: string;
  /** Région administrative officielle. */
  region: string;
}

const CITY_INDEX: Record<string, CityRef> = (() => {
  const idx: Record<string, CityRef> = {};
  for (const [region, cities] of Object.entries(QC_REGIONS)) {
    for (const name of cities) {
      idx[geoKey(name)] = { name, provinceCode: "QC", region };
    }
  }
  return idx;
})();

/**
 * Correspondance STRICTE d'une ville (après normalisation casse/accents/espaces).
 * Aucun rapprochement approximatif : « Quebek » ou « Levi » ne trouvent rien.
 * Si une province est fournie et n'est pas « QC », aucune région n'est retournée.
 */
export const resolveCity = (
  city: unknown,
  provinceCode?: string | null,
): CityRef | null => {
  if (typeof city !== "string") return null;
  const k = geoKey(city);
  if (!k) return null;
  const ref = CITY_INDEX[k];
  if (!ref) return null;
  if (provinceCode && provinceCode !== ref.provinceCode) return null;
  return ref;
};

/** Nettoyage d'affichage d'une ville non répertoriée (casse d'origine conservée). */
export const tidyCityLabel = (city: string): string => city.replace(/\s+/g, " ").trim();
