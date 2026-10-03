ALTER TABLE public.ent_crm_tasks
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'gris',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normale',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'a_faire',
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS done_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ent_crm_tasks DROP CONSTRAINT IF EXISTS ent_crm_tasks_todo_chk;
ALTER TABLE public.ent_crm_tasks ADD CONSTRAINT ent_crm_tasks_todo_chk CHECK (
  color IN ('gris','vert','bleu','jaune','orange','rouge','violet')
  AND priority IN ('basse','normale','haute','urgente')
  AND status IN ('a_faire','en_cours','fait')
  AND jsonb_typeof(checklist) = 'array');

-- Cohérence statut/done_at; un employé terrain ne peut modifier que l'avancement de SA tâche.
CREATE OR REPLACE FUNCTION public.ent_crm_tasks_todo_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NOT public.entcrm_can_write(NEW.company_id) THEN
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id
       OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.color IS DISTINCT FROM OLD.color OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'Seuls l''avancement, la liste de contrôle et le résultat peuvent être modifiés par l''employé assigné.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.status = 'fait' AND (TG_OP = 'INSERT' OR OLD.status <> 'fait') THEN
    NEW.done_at := coalesce(NEW.done_at, now()); NEW.done_by := auth.uid();
  ELSIF NEW.status <> 'fait' THEN
    NEW.done_at := NULL; NEW.done_by := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ent_crm_tasks_todo_guard ON public.ent_crm_tasks;
CREATE TRIGGER ent_crm_tasks_todo_guard BEFORE INSERT OR UPDATE ON public.ent_crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.ent_crm_tasks_todo_guard();

UPDATE public.ent_crm_tasks SET status = 'fait' WHERE done_at IS NOT NULL AND status = 'a_faire';
CREATE INDEX IF NOT EXISTS ent_crm_tasks_company_status_idx ON public.ent_crm_tasks(company_id, status, due_at);