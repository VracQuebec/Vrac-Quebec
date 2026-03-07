
-- Table pour les soumissions du questionnaire
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  materials TEXT[] NOT NULL,
  other_material TEXT DEFAULT '',
  property_type TEXT NOT NULL,
  quantity TEXT NOT NULL,
  tonnage TEXT NOT NULL,
  budget_unit TEXT DEFAULT '',
  budget_max TEXT DEFAULT '',
  machinery_available BOOLEAN DEFAULT false,
  machinery_description TEXT DEFAULT '',
  accessibility TEXT[] DEFAULT '{}',
  address TEXT NOT NULL,
  postal_code TEXT DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public form)
CREATE POLICY "Anyone can submit a request"
  ON public.submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can read (admin)
CREATE POLICY "Authenticated users can read submissions"
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete submissions"
  ON public.submissions
  FOR DELETE
  TO authenticated
  USING (true);
