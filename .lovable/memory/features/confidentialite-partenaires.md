---
name: Confidentialité des données partenaires
description: Séparation public/privé des fiches partenaires et annonces marketplace (vues publiques, grants colonnes, photos)
type: feature
---
Règles appliquées (lot sécuritaire 2026-09-13) :
- Surfaces publiques lisent uniquement des vues : `jsc_marketplace_profiles_public`, `mkt_partners_public`, `jsc_listings_public` (security_invoker).
- `jsc_listings` : `anon` n'a plus de `SELECT` global; grants colonne par colonne excluant `contact_phone`, `contact_email`, `created_by`. Coordonnées réservées aux comptes connectés.
- Coordonnées d'une fiche partenaire (`address`, `postal_code`, `phone`, `email`) : chargées seulement si session active.
- Photos partenaires (bucket `partner-photos`) : lecture publique limitée aux photos `is_public`; les autres seulement pour membres de l'entreprise et admins (`mkt_can_manage_photo_object`).
- Jamais de masquage CSS : les données privées ne doivent pas être dans le payload.
- Test de garde : `src/test/partner-privacy.test.ts`.
