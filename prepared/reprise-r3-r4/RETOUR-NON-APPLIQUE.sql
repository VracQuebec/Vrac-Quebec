-- Additive rollback: revoke ONLY new entrypoints; keep rows/history/columns.
-- Existing get_my_submissions/request_update/driver portal are not replaced by INSTALLATION.
REVOKE EXECUTE ON FUNCTION public.submission_edit_read(uuid),public.submission_edit_save(uuid,uuid,integer,jsonb,uuid,boolean),public.requisition_read(uuid),public.requisition_options(uuid),public.requisition_assign(uuid,uuid,integer,jsonb,uuid,boolean),public.requisition_action(uuid,uuid,integer,text,text,uuid,boolean) FROM authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.submission_edit_bind(uuid,uuid,boolean,text) FROM authenticated,service_role;
-- Frontend REQUEST_WORKBENCH_INSTALLED remains false; do not drop data or restore globally.
REVOKE EXECUTE ON FUNCTION public.request_update_versioned(uuid,integer,jsonb,uuid,boolean) FROM authenticated,service_role;
-- Do not remove the legacy guard while requisitions exist: old edits would bypass revalidation.