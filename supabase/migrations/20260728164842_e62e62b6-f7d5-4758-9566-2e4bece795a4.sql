UPDATE public.seo_page_tasks
   SET status='queued', attempts=0, last_error=NULL, next_attempt_at=now()
 WHERE status IN ('needs_retry','failed')
   AND last_error ILIKE '%conomie%';

-- Also reset batches marked completed with failed_tasks > 0 so cron picks them back up.
UPDATE public.seo_city_batches
   SET status='running', finished_at=NULL
 WHERE status='completed' AND failed_tasks > 0
   AND run_id=(SELECT id FROM public.seo_pipeline_runs ORDER BY created_at DESC LIMIT 1);