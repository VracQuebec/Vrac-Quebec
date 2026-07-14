// Whitelisted service area for the local SEO engine.
// Adding a new city here automatically creates all material landing pages
// and adds them to the sitemap on the next build.

export interface City {
  slug: string;
  name: string;
  region: string;
  neighbors: string[];
  lat: number;
  lng: number;
  population?: number;
  intro?: string; // extra 1–2 sentences used in the hero paragraph
}

export const CITIES: City[] = [
  { slug: "quebec", name: "Québec", region: "Capitale-Nationale", lat: 46.8139, lng: -71.208, population: 542298,
    neighbors: ["levis", "beauport", "charlesbourg", "sainte-foy", "l-ancienne-lorette"],
    intro: "Cœur de la région, la Ville de Québec regroupe les plus grands chantiers résidentiels et commerciaux du territoire desservi." },
  { slug: "levis", name: "Lévis", region: "Chaudière-Appalaches", lat: 46.7382, lng: -71.2465, population: 149683,
    neighbors: ["saint-nicolas", "saint-romuald", "charny", "pintendre", "quebec"],
    intro: "Deuxième pôle du territoire, Lévis regroupe plusieurs secteurs en développement rapide (Saint-Rédempteur, Saint-Nicolas, Pintendre)." },
  { slug: "beauport", name: "Beauport", region: "Ville de Québec", lat: 46.8747, lng: -71.1968,
    neighbors: ["quebec", "charlesbourg", "boischatel", "l-ange-gardien"] },
  { slug: "charlesbourg", name: "Charlesbourg", region: "Ville de Québec", lat: 46.859, lng: -71.2687,
    neighbors: ["quebec", "beauport", "lac-beauport", "saint-emile"] },
  { slug: "sainte-foy", name: "Sainte-Foy", region: "Ville de Québec", lat: 46.7841, lng: -71.288,
    neighbors: ["quebec", "sillery", "cap-rouge", "l-ancienne-lorette"] },
  { slug: "limoilou", name: "Limoilou", region: "Ville de Québec", lat: 46.828, lng: -71.226,
    neighbors: ["quebec", "beauport", "charlesbourg", "vanier"] },
  { slug: "saint-emile", name: "Saint-Émile", region: "Ville de Québec", lat: 46.8853, lng: -71.3372,
    neighbors: ["val-belair", "charlesbourg", "wendake", "l-ancienne-lorette"] },
  { slug: "val-belair", name: "Val-Bélair", region: "Ville de Québec", lat: 46.8531, lng: -71.4736,
    neighbors: ["saint-emile", "l-ancienne-lorette", "sainte-catherine-de-la-jacques-cartier", "shannon"] },
  { slug: "cap-rouge", name: "Cap-Rouge", region: "Ville de Québec", lat: 46.7511, lng: -71.3506,
    neighbors: ["sainte-foy", "l-ancienne-lorette", "saint-augustin-de-desmaures", "sillery"] },
  { slug: "sillery", name: "Sillery", region: "Ville de Québec", lat: 46.7708, lng: -71.2519,
    neighbors: ["sainte-foy", "quebec", "cap-rouge"] },
  { slug: "vanier", name: "Vanier", region: "Ville de Québec", lat: 46.8362, lng: -71.2739,
    neighbors: ["quebec", "limoilou", "charlesbourg", "l-ancienne-lorette"] },
  { slug: "l-ancienne-lorette", name: "L'Ancienne-Lorette", region: "Ville de Québec", lat: 46.8, lng: -71.35,
    neighbors: ["sainte-foy", "cap-rouge", "val-belair", "saint-augustin-de-desmaures"] },
  { slug: "wendake", name: "Wendake", region: "Wendake", lat: 46.8778, lng: -71.354,
    neighbors: ["saint-emile", "charlesbourg", "l-ancienne-lorette"] },
  { slug: "saint-augustin-de-desmaures", name: "Saint-Augustin-de-Desmaures", region: "Capitale-Nationale", lat: 46.7386, lng: -71.4425,
    neighbors: ["cap-rouge", "l-ancienne-lorette", "neuville", "sainte-catherine-de-la-jacques-cartier"] },
  { slug: "boischatel", name: "Boischatel", region: "Côte-de-Beaupré", lat: 46.9, lng: -71.15,
    neighbors: ["beauport", "l-ange-gardien", "chateau-richer", "quebec"] },
  { slug: "l-ange-gardien", name: "L'Ange-Gardien", region: "Côte-de-Beaupré", lat: 46.9231, lng: -71.0844,
    neighbors: ["boischatel", "chateau-richer", "beauport"] },
  { slug: "chateau-richer", name: "Château-Richer", region: "Côte-de-Beaupré", lat: 46.9614, lng: -71.03,
    neighbors: ["l-ange-gardien", "boischatel"] },
  { slug: "sainte-brigitte-de-laval", name: "Sainte-Brigitte-de-Laval", region: "Capitale-Nationale", lat: 46.9436, lng: -71.2233,
    neighbors: ["beauport", "lac-beauport", "boischatel"] },
  { slug: "lac-beauport", name: "Lac-Beauport", region: "Jacques-Cartier", lat: 46.9333, lng: -71.2833,
    neighbors: ["charlesbourg", "stoneham-et-tewkesbury", "sainte-brigitte-de-laval"] },
  { slug: "stoneham-et-tewkesbury", name: "Stoneham-et-Tewkesbury", region: "Jacques-Cartier", lat: 47.0333, lng: -71.35,
    neighbors: ["lac-beauport", "shannon", "saint-gabriel-de-valcartier"] },
  { slug: "shannon", name: "Shannon", region: "Jacques-Cartier", lat: 46.8833, lng: -71.5167,
    neighbors: ["saint-gabriel-de-valcartier", "val-belair", "stoneham-et-tewkesbury"] },
  { slug: "saint-gabriel-de-valcartier", name: "Saint-Gabriel-de-Valcartier", region: "Jacques-Cartier", lat: 46.9333, lng: -71.4667,
    neighbors: ["shannon", "stoneham-et-tewkesbury"] },
  { slug: "saint-nicolas", name: "Saint-Nicolas", region: "Lévis", lat: 46.7, lng: -71.35,
    neighbors: ["levis", "charny", "saint-romuald", "saint-lambert-de-lauzon"] },
  { slug: "charny", name: "Charny", region: "Lévis", lat: 46.7167, lng: -71.2667,
    neighbors: ["saint-nicolas", "saint-romuald", "breakeyville", "levis"] },
  { slug: "saint-romuald", name: "Saint-Romuald", region: "Lévis", lat: 46.75, lng: -71.2333,
    neighbors: ["charny", "saint-nicolas", "levis", "breakeyville"] },
  { slug: "breakeyville", name: "Breakeyville", region: "Lévis", lat: 46.6667, lng: -71.2333,
    neighbors: ["charny", "saint-lambert-de-lauzon", "saint-romuald"] },
  { slug: "pintendre", name: "Pintendre", region: "Lévis", lat: 46.7167, lng: -71.1333,
    neighbors: ["levis", "saint-romuald"] },
  { slug: "saint-lambert-de-lauzon", name: "Saint-Lambert-de-Lauzon", region: "Chaudière-Appalaches", lat: 46.5833, lng: -71.2,
    neighbors: ["breakeyville", "saint-nicolas", "saint-apollinaire"] },
  { slug: "saint-apollinaire", name: "Saint-Apollinaire", region: "Chaudière-Appalaches", lat: 46.6167, lng: -71.5167,
    neighbors: ["laurier-station", "saint-lambert-de-lauzon", "saint-nicolas"] },
  { slug: "laurier-station", name: "Laurier-Station", region: "Chaudière-Appalaches", lat: 46.55, lng: -71.6333,
    neighbors: ["saint-apollinaire"] },
  { slug: "pont-rouge", name: "Pont-Rouge", region: "Portneuf", lat: 46.7539, lng: -71.6947,
    neighbors: ["donnacona", "neuville", "sainte-catherine-de-la-jacques-cartier"] },
  { slug: "donnacona", name: "Donnacona", region: "Portneuf", lat: 46.6772, lng: -71.7331,
    neighbors: ["pont-rouge", "neuville"] },
  { slug: "neuville", name: "Neuville", region: "Portneuf", lat: 46.6853, lng: -71.5789,
    neighbors: ["pont-rouge", "donnacona", "saint-augustin-de-desmaures"] },
  { slug: "sainte-catherine-de-la-jacques-cartier", name: "Sainte-Catherine-de-la-Jacques-Cartier", region: "Jacques-Cartier",
    lat: 46.8461, lng: -71.6236,
    neighbors: ["pont-rouge", "val-belair", "saint-augustin-de-desmaures", "shannon"] },
];

export const CITY_MAP: Record<string, City> = Object.fromEntries(
  CITIES.map((c) => [c.slug, c])
);

export const CITIES_BY_REGION = CITIES.reduce<Record<string, City[]>>((acc, c) => {
  (acc[c.region] ||= []).push(c);
  return acc;
}, {});

// Reserved top-level slugs that must never be interpreted as a city+material combo.
// Update this if a new top-level route is added.
export const RESERVED_TOP_LEVEL_SLUGS = new Set([
  "", "index", "login", "forgot-password", "reset-password",
  "admin", "entrepreneur", "blog", "livraison",
  "sitemap.xml", "robots.txt", "favicon.ico",
  "not-found", "unsubscribe",
]);