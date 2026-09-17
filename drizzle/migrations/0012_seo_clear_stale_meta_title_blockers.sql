UPDATE public.seo_pages
SET qa_blockers = ARRAY(SELECT b FROM unnest(coalesce(qa_blockers,'{}')) b WHERE b NOT LIKE 'Meta title%')
WHERE array_length(qa_blockers,1) > 0
  AND coalesce(length(meta_title),0) >= 30;