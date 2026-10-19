-- PREPARED ONLY. Never apply on the public/shared server in this lot.
-- Optional hourly fallback after explicit isolated activation; 24 checks/day, <=60 min delay.
-- Reuses the existing queue infrastructure's service credential; creates no secret or email infrastructure.
-- Requires pg_cron/pg_net already installed, and EXEC01_PORTAL_ORIGIN configured server-side.
-- Replace __FUNCTION_ORIGIN__ during authorized installation only; never commit credentials.
SELECT cron.schedule('exec02-reception-lifecycle','0 * * * *',$job$
 SELECT net.http_post(
  url:='__FUNCTION_ORIGIN__/submission-owner-portal/reception-lifecycle',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
  body:='{}'::jsonb
 ) WHERE EXISTS(SELECT 1 FROM submission_reception_reservations WHERE state IN ('pending','counter','reserved'));
$job$);