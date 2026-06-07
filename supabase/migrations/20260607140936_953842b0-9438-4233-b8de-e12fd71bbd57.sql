
-- Submissions: defaults for public inserts, visibility sync, audit log
DROP TRIGGER IF EXISTS submissions_enforce_insert_defaults ON public.submissions;
CREATE TRIGGER submissions_enforce_insert_defaults
  BEFORE INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_submission_insert_defaults();

DROP TRIGGER IF EXISTS submissions_sync_visible_to_entrepreneur ON public.submissions;
CREATE TRIGGER submissions_sync_visible_to_entrepreneur
  BEFORE INSERT OR UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_visible_to_entrepreneur();

DROP TRIGGER IF EXISTS submissions_assign_dompe_number ON public.submissions;
CREATE TRIGGER submissions_assign_dompe_number
  BEFORE INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.assign_dompe_number();

DROP TRIGGER IF EXISTS submissions_log_changes ON public.submissions;
CREATE TRIGGER submissions_log_changes
  AFTER UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.log_submission_changes();

-- Custom fields / values
DROP TRIGGER IF EXISTS custom_fields_touch_updated_at ON public.custom_fields;
CREATE TRIGGER custom_fields_touch_updated_at
  BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.touch_custom_fields_updated_at();

DROP TRIGGER IF EXISTS submission_custom_values_log_changes ON public.submission_custom_values;
CREATE TRIGGER submission_custom_values_log_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.submission_custom_values
  FOR EACH ROW EXECUTE FUNCTION public.log_custom_value_changes();

-- Lead statuses
DROP TRIGGER IF EXISTS lead_statuses_touch_updated_at ON public.lead_statuses;
CREATE TRIGGER lead_statuses_touch_updated_at
  BEFORE UPDATE ON public.lead_statuses
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_statuses_updated_at();

-- Lead trips (billing)
DROP TRIGGER IF EXISTS lead_trips_assign_invoice_number ON public.lead_trips;
CREATE TRIGGER lead_trips_assign_invoice_number
  BEFORE INSERT ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.assign_lead_trip_invoice_number();

DROP TRIGGER IF EXISTS lead_trips_compute_due_date ON public.lead_trips;
CREATE TRIGGER lead_trips_compute_due_date
  BEFORE INSERT OR UPDATE ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.compute_lead_trip_due_date();

DROP TRIGGER IF EXISTS lead_trips_compute_taxes ON public.lead_trips;
CREATE TRIGGER lead_trips_compute_taxes
  BEFORE INSERT OR UPDATE ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.compute_lead_trip_taxes();
