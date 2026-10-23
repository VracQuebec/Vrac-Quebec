-- Non-destructive closure of new entrypoints only. Keep access guards and data.
REVOKE ALL ON FUNCTION public.driver_invite_capture(uuid,uuid,text,text,text,text,uuid),public.driver_tracking_start(uuid,boolean) FROM PUBLIC,anon,authenticated;
-- Do not restore vulnerable notification/mission/document policies or old RPCs.
-- Admin retains approved-role access to historical records; no schema/data removal.