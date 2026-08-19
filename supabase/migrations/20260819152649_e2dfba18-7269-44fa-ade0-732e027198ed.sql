ALTER TABLE public.seo_pages
  ADD COLUMN IF NOT EXISTS proc_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS proc_kind text,
  ADD COLUMN IF NOT EXISTS proc_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS proc_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS proc_error text,
  ADD COLUMN IF NOT EXISTS proc_result jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_pages_proc_status_check') THEN
    ALTER TABLE public.seo_pages ADD CONSTRAINT seo_pages_proc_status_check
      CHECK (proc_status IN ('idle','running','done','error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS seo_pages_proc_status_idx ON public.seo_pages (proc_status) WHERE proc_status <> 'idle';