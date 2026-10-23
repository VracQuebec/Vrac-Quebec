import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
export async function createR4CLocal() {
 if(process.env.REQUEST_WORKBENCH_LOCAL!=='1') throw Error('Explicit disposable local mode required');
 const name='r4c_'+crypto.randomUUID().replace(/-/g,'');
 const root=postgres('postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable',{ssl:false});
 const check=(await root`select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') path`)[0];
 if(check.host!=='127.0.0.1'||check.port!==55439||!check.path.startsWith('/tmp/exec-correctifs/reprise-r3/')) {await root.end();throw Error('Isolation non prouvée');}
 await root.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
 const db=postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`,{ssl:false});
 const cleanup=async()=>{await db.end();await root.unsafe(`DROP DATABASE ${name}`);await root.end();};
 try {
  await db.unsafe(await readFile('prepared/reprise-r3-r4/fixture.sql','utf8'));
  await db.unsafe(`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   ALTER TABLE jsc_company_members ADD COLUMN email text,ADD COLUMN full_name text;
   CREATE UNIQUE INDEX local_company_user ON jsc_company_members(company_id,user_id);
   ALTER TABLE jsc_drivers ADD COLUMN default_truck_id uuid,ADD COLUMN internal_notes text,ADD COLUMN hourly_cost numeric;
   CREATE FUNCTION entcrm_can_admin(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=c AND user_id=auth.uid() AND role='proprietaire' AND is_active AND archived_at IS NULL)$$;
   CREATE FUNCTION pun_can_read(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=c AND user_id=auth.uid() AND is_active AND archived_at IS NULL)$$;
   CREATE FUNCTION jsc_my_driver_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT d.id FROM jsc_drivers d JOIN jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.user_id=auth.uid() AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur'$$;
   REVOKE ALL ON FUNCTION jsc_my_driver_ids() FROM PUBLIC;GRANT EXECUTE ON FUNCTION jsc_my_driver_ids() TO authenticated;
   CREATE TABLE local_invitation_capture(invitation_id uuid PRIMARY KEY,payload jsonb);`);
  const employee=await readFile('prepared/exec06/schema.sql','utf8');
  await db.unsafe(employee.slice(employee.indexOf('CREATE TABLE public.ent_employee_invites'),employee.indexOf('-- Preserve canonical mechanisms')));
  await db.unsafe('REVOKE ALL ON FUNCTION pun_invite_prepare(uuid,text,text,text,text),pun_invite_accept(text),pun_invite_revoke(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION pun_invite_prepare(uuid,text,text,text,text),pun_invite_accept(text),pun_invite_revoke(uuid) TO authenticated;');
  const coord=await readFile('prepared/exec01b/coordination.sql','utf8');
  await db.unsafe(coord.slice(coord.indexOf('CREATE TABLE public.submission_reception_reservations'),coord.indexOf('CREATE TABLE public.submission_reception_operations')));
  const base=await readFile('src/test/fixtures/exec02-base.sql','utf8');
  await db.unsafe(base.slice(base.indexOf('CREATE TABLE request_followups'),base.indexOf('CREATE TABLE crm_notifications')));
  await db.unsafe(coord.slice(coord.indexOf('CREATE FUNCTION public.exec02_exception'),coord.indexOf('-- One service RPC')));
  for(const path of ['R4B-COMPOSITION-NON-APPLIQUEE.sql','INSTALLATION-NON-APPLIQUEE.sql','R4C-INVITATIONS-NON-APPLIQUEES.sql']) await db.unsafe(await readFile('prepared/reprise-r3-r4/'+path,'utf8'));
  await db.unsafe(`CREATE TABLE jsc_deliveries(id uuid PRIMARY KEY,company_id uuid,driver_id uuid,delivery_number text,status text,scheduled_date date,scheduled_time time,delivery_address text,city text,postal_code text,latitude float8,longitude float8,quantity numeric,quantity_unit text,distance_km numeric,notes text,driver_notes text,signature_name text,proof_photos text[],material_id uuid,pickup_location_id uuid,client_id uuid,archived_at timestamptz);
   CREATE TABLE jsc_materials(id uuid PRIMARY KEY,name text);CREATE TABLE jsc_pickup_locations(id uuid PRIMARY KEY,name text);CREATE TABLE jsc_clients(id uuid PRIMARY KEY,name text);
   GRANT SELECT ON jsc_drivers TO authenticated;
   CREATE POLICY "portal driver reads own file" ON jsc_drivers FOR SELECT TO authenticated USING(user_id=auth.uid());`);
  const portalBase=await readFile('supabase/migrations/20260731164309_78da7c5b-c06c-49e6-b219-4b19699eff86.sql','utf8');
  await db.unsafe(portalBase.slice(portalBase.indexOf('CREATE OR REPLACE FUNCTION public.jsc_driver_portal')));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4C-PORTAIL-NON-APPLIQUE.sql','utf8'));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4C-PROFIL-RLS-NON-APPLIQUE.sql','utf8'));
  // Existing queue/capture contract, disposable fixture only (not PGMQ/Auth/Storage service).
  await db.unsafe(`CREATE TABLE email_send_log(id uuid DEFAULT gen_random_uuid(),message_id text,template_name text,recipient_email text,status text,metadata jsonb,created_at timestamptz DEFAULT now());
   CREATE TABLE local_email_capture(id bigserial PRIMARY KEY,queue_name text,payload jsonb);
   CREATE TABLE local_queue_failure(enabled boolean);INSERT INTO local_queue_failure VALUES(false);
   CREATE FUNCTION enqueue_email(queue_name text,payload jsonb) RETURNS bigint LANGUAGE plpgsql AS $$DECLARE i bigint;BEGIN IF (SELECT enabled FROM local_queue_failure) THEN RAISE EXCEPTION 'capture indisponible';END IF;INSERT INTO local_email_capture(queue_name,payload)VALUES(queue_name,payload)RETURNING id INTO i;RETURN i;END$$;
   CREATE FUNCTION jsc_can_manage(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT has_role(u,'admin')$$;
   CREATE FUNCTION cpn_my_entrepreneur() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULL::uuid$$;
   CREATE TABLE entrepreneurs(id uuid PRIMARY KEY);
   GRANT SELECT,UPDATE ON jsc_deliveries TO authenticated;ALTER TABLE jsc_deliveries ENABLE ROW LEVEL SECURITY;
   CREATE POLICY delivery_read ON jsc_deliveries FOR SELECT TO authenticated USING(driver_id IN(SELECT jsc_my_driver_ids()));
   CREATE POLICY delivery_update ON jsc_deliveries FOR UPDATE TO authenticated USING(driver_id IN(SELECT jsc_my_driver_ids())) WITH CHECK(driver_id IN(SELECT jsc_my_driver_ids()));
   GRANT SELECT,UPDATE ON jsc_notifications TO authenticated;
   CREATE POLICY "Admins manage notifications" ON jsc_notifications FOR ALL TO authenticated USING(jsc_can_manage(auth.uid()) OR user_id=auth.uid()) WITH CHECK(jsc_can_manage(auth.uid()));
   CREATE POLICY "portal reads own notifications" ON jsc_notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
   CREATE POLICY "portal updates own notifications" ON jsc_notifications FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
   GRANT SELECT ON jsc_company_members TO authenticated;CREATE POLICY local_member ON jsc_company_members FOR SELECT TO authenticated USING(user_id=auth.uid());`);
  const tracking=await readFile('drizzle/migrations/0150_ops02_trips_services_tracking.sql','utf8');
  await db.unsafe(tracking.slice(tracking.indexOf('CREATE TABLE public.drv_missions')));
  await db.unsafe(await readFile('drizzle/migrations/0171_drv_points_natif.sql','utf8'));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4D-CAPTURE-NON-APPLIQUEE.sql','utf8'));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4D-REVOCATION-NON-APPLIQUEE.sql','utf8'));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4D-RPC-MISSIONS-NON-APPLIQUE.sql','utf8'));
  // Storage policy fixture only: metadata authorization, NOT a running Storage service.
  await db.unsafe(`CREATE SCHEMA storage;CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
   CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array(name,'/')$$;
   GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT ON storage.objects TO authenticated;ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION entcrm_can_read(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=c AND user_id=auth.uid() AND is_active AND archived_at IS NULL)$$;
   CREATE FUNCTION asr_can_read(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT false$$;
   CREATE TABLE asr_documents(id uuid,storage_path text,company_id uuid);GRANT SELECT ON asr_documents TO authenticated;
   CREATE FUNCTION asr_driver_doc_ok(did uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM asr_documents d WHERE d.id=did AND driver_company_active(d.company_id))$$;
   CREATE POLICY asr_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='asr-files' AND EXISTS(SELECT 1 FROM asr_documents d WHERE d.storage_path=objects.name AND asr_driver_doc_ok(d.id)));`);
  await db.unsafe(await readFile('drizzle/migrations/0175_company_documents.sql','utf8'));
  await db.unsafe(await readFile('prepared/reprise-r3-r4/R4D-DOCUMENTS-NON-APPLIQUE.sql','utf8'));
  const as=<T>(user:string,fn:(tx:postgres.TransactionSql)=>Promise<T>)=>db.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${user},true)`;await tx.unsafe('SET LOCAL ROLE authenticated');return fn(tx);});
  // No network/sender: internal DB capture only. Never exported as a hosted mail adapter.
  const capture=async(invitation:string,token:string)=>{await db`insert into local_invitation_capture values(${invitation},${db.json({mode:'TEST_CAPTURE_ONLY',token})}) on conflict(invitation_id) do update set payload=excluded.payload`;};
  return {db,as,capture,cleanup};
 }catch(error){await cleanup();throw error;}
}