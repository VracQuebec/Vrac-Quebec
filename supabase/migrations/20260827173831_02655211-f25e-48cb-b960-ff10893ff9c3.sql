ALTER TABLE public.crm_notification_settings ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_push_subscriptions ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.crm_push_subscriptions ADD COLUMN IF NOT EXISTS last_test_at timestamptz;