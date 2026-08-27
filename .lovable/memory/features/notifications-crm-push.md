---
name: Centre de notifications CRM + Push iPhone
description: Table crm_notifications, déclencheurs automatiques, veille planifiée, cloche CRM, page /admin/notifications et Web Push iOS
type: feature
---
Couche notifications de Vrac Québec OS (aucune duplication de données métier : chaque notification référence l'entité et fournit un lien direct).

Base : `crm_notifications` (statuts unread/read/in_progress/done/archived, `dedupe_key` anti-doublon, priorités urgente/importante/normale/information, `action_url`), `crm_notification_settings` (scope `global` : catégories CRM, catégories push, délais `lead_untreated_hours`, `quote_followup_days`, `payment_overdue_days`, `delivery_reminder_hours`), `crm_push_subscriptions` (endpoint + p256dh/auth par appareil).
Automatisation : fonctions `crm_notify()` / `crm_resolve()`, déclencheurs sur leads, changements de statut, livraisons, paiements ; cron `crm-notifications-sweep` (10 min) pour les conditions temporelles ; cron `crm-push-dispatch` (1 min) qui appelle l'edge function du même nom.
Push : edge function `crm-push-dispatch` (actions `config` / `dispatch` / `test`), secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRM_PUSH_CRON_SECRET`. Service worker dédié `public/push-sw.js` — push uniquement, jamais de cache hors ligne ni d'interception de navigation. Manifeste `public/manifest.webmanifest` (installation écran d'accueil requise sur iOS).
Front : `src/lib/notifications/api.ts`, `src/lib/notifications/push.ts`, `useCrmNotifications` (temps réel), `NotificationBell`, `TodoNow` (widget « À faire maintenant »), page `/admin/notifications`.
Lien profond : `/admin?lead=<uuid>` ouvre directement la fiche lead.
