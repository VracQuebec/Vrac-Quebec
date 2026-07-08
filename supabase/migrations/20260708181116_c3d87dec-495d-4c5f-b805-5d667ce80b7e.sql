
CREATE TABLE public.blog_post_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  primary_keyword TEXT NOT NULL,
  secondary_keywords TEXT[] NOT NULL DEFAULT '{}',
  search_intent TEXT NOT NULL CHECK (search_intent IN ('informational','commercial','transactional','navigational')),
  seo_difficulty TEXT NOT NULL CHECK (seo_difficulty IN ('facile','moyen','difficile')),
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  monthly_searches INT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','planned','in_progress','published','archived')),
  planned_publish_date DATE,
  notes TEXT,
  created_post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX blog_post_ideas_category_idx ON public.blog_post_ideas(category);
CREATE INDEX blog_post_ideas_priority_idx ON public.blog_post_ideas(priority);
CREATE INDEX blog_post_ideas_status_idx ON public.blog_post_ideas(status);
CREATE INDEX blog_post_ideas_planned_idx ON public.blog_post_ideas(planned_publish_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_ideas TO authenticated;
GRANT ALL ON public.blog_post_ideas TO service_role;

ALTER TABLE public.blog_post_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage blog ideas"
ON public.blog_post_ideas
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_blog_post_ideas_updated_at
BEFORE UPDATE ON public.blog_post_ideas
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
