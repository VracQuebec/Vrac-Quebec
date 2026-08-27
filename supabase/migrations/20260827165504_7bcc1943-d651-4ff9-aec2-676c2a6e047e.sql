SELECT cron.schedule(
  'crm-push-dispatch',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://kenduhxscnynugpvktin.supabase.co/functions/v1/crm-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'KydD3atpKRGMwvgccDsQjgHcdb7sQlZWz8k4JLlroSE'
    ),
    body := jsonb_build_object('action','dispatch')
  );
  $cron$
);