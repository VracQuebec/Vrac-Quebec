CREATE INDEX IF NOT EXISTS crm_notifications_created_at_idx ON public.crm_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS seo_pages_meta_title_idx ON public.seo_pages (meta_title);