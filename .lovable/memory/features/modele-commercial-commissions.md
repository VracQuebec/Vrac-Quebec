---
name: Modèle commercial et commissions (place de marché)
description: Règles tarifaires mkt_pricing_rules, calcul automatique des revenus à l'attribution, statuts de commission et écran /admin/marche/commissions
type: feature
---
9 modèles possibles (`mkt_pricing_rules.model`) : commission_pourcentage, commission_fixe, marge, frais_par_lead, frais_deblocage, abonnement, credits, gratuit, entente_personnalisee. Colonnes ajoutées : `scope` (partenaire/client/les_deux), `subscription_amount`, `credits`, `is_default`.

Résolution : `mkt_resolve_pricing_rule(company_id, category_id, at)` — entreprise+catégorie > entreprise > catégorie > globale, filtrée par statut actif et dates de validité, puis `priority`.

Calcul : trigger `mkt_awards_commission` (INSERT/UPDATE de amount, final_amount, status) → `mkt_compute_commission(award_id)` écrit dans `mkt_commissions` (base_amount, amount, model, label, rule_snapshot figé). Jamais rétroactif : une commission dont le statut dépasse `a_confirmer` n'est plus recalculée. Statuts : a_confirmer, a_facturer, facturee, payee, annulee, contestee via `mkt_set_commission_status`. Lecture admin via `mkt_commission_board()`.

Table `mkt_partner_credits` (solde de crédits par entreprise, lecture membre, écriture admin).
Écran `/admin/marche/commissions` (`src/pages/AdminMarketplaceCommissions.tsx`) : onglets Règles tarifaires / Revenus et commissions. API dans `src/lib/marketplace/api.ts` (PRICING_MODELS, COMMISSION_STATUSES, fetchPricingRules, savePricingRule, deletePricingRule, fetchCommissions, setCommissionStatus, fetchPartnerCompanies).
