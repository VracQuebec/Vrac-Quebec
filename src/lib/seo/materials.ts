// Materials covered by the local SEO landing pages. Adding a material here
// automatically creates one landing page per allowed city.

export interface Material {
  slug: string;
  name: string;      // full French name (title-cased)
  shortName: string; // short label for badges / links
  keywords: string[];
  useCases: string[];
  deliveryUnit: "verge cube" | "tonne";
  relatedMaterials: string[];
  description: string;   // 1–2 sentences reusable in the intro
}

export const MATERIALS: Material[] = [
  {
    slug: "terre-remplissage",
    name: "Terre de remplissage",
    shortName: "Terre de remplissage",
    keywords: ["terre de remplissage", "terre remblai", "terre propre", "remblai terre"],
    useCases: [
      "Remplir un trou ou un fond de piscine démolie",
      "Niveler un terrain avant l'aménagement paysager",
      "Créer une pente pour drainer un terrain",
      "Combler une excavation résidentielle ou commerciale",
    ],
    deliveryUnit: "verge cube",
    relatedMaterials: ["remblai", "terre-tamisee", "sable"],
    description:
      "Terre propre, exempte de débris, idéale pour remplir, niveler ou combler un terrain avant l'aménagement final.",
  },
  {
    slug: "terre-tamisee",
    name: "Terre tamisée",
    shortName: "Terre tamisée",
    keywords: ["terre tamisée", "terre à jardin", "terre noire", "terre végétale"],
    useCases: [
      "Semer une pelouse neuve",
      "Préparer un potager ou une plate-bande",
      "Rehausser un terrain avant le gazon",
    ],
    deliveryUnit: "verge cube",
    relatedMaterials: ["terre-remplissage", "sable"],
    description:
      "Terre criblée fine et enrichie, prête pour la pelouse, les plates-bandes et les projets d'aménagement paysager.",
  },
  {
    slug: "sable",
    name: "Sable",
    shortName: "Sable",
    keywords: ["sable de remplissage", "sable naturel", "sable de tranchée", "sable pour patio"],
    useCases: [
      "Coussin de pavé-uni ou de dalles",
      "Remplissage de tranchée d'aqueduc ou d'égout",
      "Base compactée pour un abri, un cabanon ou un patio",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["gravier-0-3-4", "poussiere-de-pierre", "mg-20"],
    description:
      "Sable naturel utilisé pour les tranchées, les coussins de pavés et la base des ouvrages compactés.",
  },
  {
    slug: "gravier-0-3-4",
    name: "Gravier 0-3/4",
    shortName: "Gravier 0-3/4",
    keywords: ["gravier 0-3/4", "gravier concassé", "gravier de base", "0-3/4"],
    useCases: [
      "Fondation d'entrée de garage ou de stationnement",
      "Base compactée sous une dalle de béton",
      "Chemin d'accès temporaire de chantier",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["mg-20", "mg-56", "pierre-concassee"],
    description:
      "Gravier concassé polyvalent, calibre 0 à 3/4 pouce, utilisé comme base compactée pour la plupart des ouvrages résidentiels.",
  },
  {
    slug: "mg-20",
    name: "MG-20",
    shortName: "MG-20",
    keywords: ["MG-20", "MG20", "concassé MG-20", "criblé MG-20"],
    useCases: [
      "Base de rue, d'entrée ou de stationnement asphalté",
      "Assise sous un pavé-uni de grande surface",
      "Fondation approuvée pour un ouvrage municipal",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["gravier-0-3-4", "mg-56", "pierre-concassee"],
    description:
      "Concassé calibré 0 à 20 mm conforme aux normes MTQ, idéal comme fondation supérieure sous asphalte ou pavé.",
  },
  {
    slug: "mg-56",
    name: "MG-56",
    shortName: "MG-56",
    keywords: ["MG-56", "MG56", "sous-fondation", "concassé MG-56"],
    useCases: [
      "Sous-fondation d'un stationnement ou d'une rue",
      "Chemin d'accès de chantier avec charges lourdes",
      "Élévation avant la couche de MG-20",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["mg-20", "gravier-0-3-4"],
    description:
      "Concassé calibré 0 à 56 mm, utilisé comme sous-fondation pour supporter les couches supérieures et les charges lourdes.",
  },
  {
    slug: "pierre-concassee",
    name: "Pierre concassée",
    shortName: "Pierre concassée",
    keywords: ["pierre concassée", "pierre 3/4", "pierre nette", "concassé"],
    useCases: [
      "Drainage autour d'une fondation",
      "Puits de captage ou drain français",
      "Contour de piscine ou de patio",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["pierre-nette", "gravier-0-3-4", "poussiere-de-pierre"],
    description:
      "Pierre concassée résistante utilisée pour le drainage, les fondations et tous les usages où la portance et le drainage comptent.",
  },
  {
    slug: "pierre-nette",
    name: "Pierre nette",
    shortName: "Pierre nette",
    keywords: ["pierre nette", "pierre lavée", "pierre 3/4 nette", "drainage"],
    useCases: [
      "Drain français autour d'une fondation",
      "Lit filtrant sous une installation septique",
      "Contour de piscine creusée",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["pierre-concassee", "gravier-0-3-4"],
    description:
      "Pierre lavée sans fines, spécialement conçue pour le drainage et les zones où l'écoulement de l'eau est essentiel.",
  },
  {
    slug: "poussiere-de-pierre",
    name: "Poussière de pierre",
    shortName: "Poussière de pierre",
    keywords: ["poussière de pierre", "poussière 0-1/4", "criblure"],
    useCases: [
      "Coussin fin sous un pavé-uni",
      "Nivellement de surface pour patio",
      "Finition de sentier ou d'allée",
    ],
    deliveryUnit: "tonne",
    relatedMaterials: ["sable", "gravier-0-3-4"],
    description:
      "Poussière de pierre calibrée 0 à 1/4 pouce, idéale comme coussin fin sous pavé-uni ou pour parfaire un nivellement.",
  },
  {
    slug: "remblai",
    name: "Remblai",
    shortName: "Remblai",
    keywords: ["remblai", "remblai propre", "matériel de remblayage", "remblaiement"],
    useCases: [
      "Combler une excavation résidentielle",
      "Remplir une fosse septique désaffectée",
      "Relever le niveau d'un terrain avant construction",
    ],
    deliveryUnit: "verge cube",
    relatedMaterials: ["terre-remplissage", "sable", "gravier-0-3-4"],
    description:
      "Matériel de remblayage propre, livré rapidement pour combler, niveler ou relever un terrain avant la suite des travaux.",
  },
];

export const MATERIAL_MAP: Record<string, Material> = Object.fromEntries(
  MATERIALS.map((m) => [m.slug, m])
);