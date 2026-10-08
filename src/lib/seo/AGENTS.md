# SEO
- Pages SEO locales : seules les fiches seo_pages publiées sont indexables et liées (maillage local dérivé au rendu par localMesh.ts); les pages « matériau + ville » de secours restent en noindex et ne sont jamais liées — évite le contenu de masse sans fiche réelle.
- Couverture SEO d'une ville : cityCoverage.ts (lecture seo_city_coverage) mesure les pages existantes sur le catalogue actif et ne compte jamais une page comme « prévue » du seul fait d'exister; seo_city_slots_expected reste la file du Générateur — évite un faux 100 %.
