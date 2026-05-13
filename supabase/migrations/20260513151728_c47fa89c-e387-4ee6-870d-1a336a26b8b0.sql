-- Custom fields definitions
CREATE TABLE public.custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','multiselect','textarea')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage custom_fields" ON public.custom_fields
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Per-submission custom values
CREATE TABLE public.submission_custom_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, field_id)
);

CREATE INDEX idx_scv_submission ON public.submission_custom_values(submission_id);

ALTER TABLE public.submission_custom_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage submission_custom_values" ON public.submission_custom_values
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Audit log
CREATE TABLE public.submission_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT,
  old_value JSONB,
  new_value JSONB,
  user_id UUID,
  user_email TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_submission ON public.submission_audit_log(submission_id, changed_at DESC);

ALTER TABLE public.submission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log" ON public.submission_audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Helper: get current user email
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid()
$$;

-- Trigger function: log submission changes
CREATE OR REPLACE FUNCTION public.log_submission_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  uemail TEXT := public.current_user_email();
  old_j JSONB := to_jsonb(OLD);
  new_j JSONB := to_jsonb(NEW);
  k TEXT;
  ov JSONB;
  nv JSONB;
  ignored TEXT[] := ARRAY['id','submission_number','created_at','updated_at','latitude','longitude','dompe_number'];
BEGIN
  FOR k IN SELECT jsonb_object_keys(new_j) LOOP
    IF k = ANY(ignored) THEN CONTINUE; END IF;
    ov := old_j->k;
    nv := new_j->k;
    IF ov IS DISTINCT FROM nv THEN
      INSERT INTO public.submission_audit_log(submission_id, field_key, field_label, old_value, new_value, user_id, user_email)
      VALUES (NEW.id, k, k, ov, nv, uid, uemail);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_submission_changes
AFTER UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.log_submission_changes();

-- Trigger function: log custom value changes
CREATE OR REPLACE FUNCTION public.log_custom_value_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  uemail TEXT := public.current_user_email();
  fld RECORD;
  sid UUID;
  ov JSONB;
  nv JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    sid := OLD.submission_id;
    SELECT key, label INTO fld FROM public.custom_fields WHERE id = OLD.field_id;
    INSERT INTO public.submission_audit_log(submission_id, field_key, field_label, old_value, new_value, user_id, user_email)
    VALUES (sid, COALESCE('custom:'||fld.key,'custom'), fld.label, OLD.value, NULL, uid, uemail);
    RETURN OLD;
  END IF;

  sid := NEW.submission_id;
  SELECT key, label INTO fld FROM public.custom_fields WHERE id = NEW.field_id;
  ov := CASE WHEN TG_OP = 'UPDATE' THEN OLD.value ELSE NULL END;
  nv := NEW.value;
  IF ov IS DISTINCT FROM nv THEN
    INSERT INTO public.submission_audit_log(submission_id, field_key, field_label, old_value, new_value, user_id, user_email)
    VALUES (sid, 'custom:'||fld.key, fld.label, ov, nv, uid, uemail);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_custom_value_changes
AFTER INSERT OR UPDATE OR DELETE ON public.submission_custom_values
FOR EACH ROW EXECUTE FUNCTION public.log_custom_value_changes();

-- Touch updated_at on custom_fields
CREATE OR REPLACE FUNCTION public.touch_custom_fields_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_custom_fields
BEFORE UPDATE ON public.custom_fields
FOR EACH ROW EXECUTE FUNCTION public.touch_custom_fields_updated_at();

CREATE TRIGGER trg_touch_scv
BEFORE UPDATE ON public.submission_custom_values
FOR EACH ROW EXECUTE FUNCTION public.touch_custom_fields_updated_at();