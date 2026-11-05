# Accès « Administration — Lecture seule » — finalisation (2026-11-05)

- compta2027@gmail.com : rôle entrepreneur retiré; seul accès restant = adm_readonly_users actif (non test). Aucun autre compte modifié.
- Pièce jointe de soumission interne (TEST A, E2E 29178, plan.pdf) ouverte sur vracquebec.ca par le compte fictif via secure-file (200), trace serveur document_ouverture; aucun champ de dépôt actif, aucun fichier créé.
- Relais adm-ro-proxy : session vérifiée mise en mémoire ≤ 60 s par jeton, accès lecture seule relu à chaque requête, vérifications en parallèle, journal écrit en arrière-plan (waitUntil).
- Mesures (site publié, même compte, une passe chacune) avant → après : CRM 7,2 → 6,1 s; Finances 8,3 → 6,0 s; Assurances 4,2 → 3,1 s; Agenda 8,3 → 5,2 s. Médiane par requête relais ~0,9–1,3 s → ~0,7–0,9 s.
- Écritures directes (REST, Storage, journal) refusées 403/RLS; via relais refusées et journalisées. Les refus directs hors relais ne sont pas journalisés (limite).
- Durée de conservation : non choisie, réglable dans /admin/journal-activite.
