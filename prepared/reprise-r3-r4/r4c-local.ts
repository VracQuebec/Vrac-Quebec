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
   CREATE TABLE local_invitation_capture(invitation_id uuid PRIMARY KEY REFERENCES ent_crm_history(id),payload jsonb);` .replace(' REFERENCES ent_crm_history(id)',''));
  const employee=await readFile('prepared/exec06/schema.sql','utf8');
  await db.unsafe(employee.slice(employee.indexOf('CREATE TABLE public.ent_employee_invites'),employee.indexOf('-- Preserve canonical mechanisms')));
  await db.unsafe('REVOKE ALL ON FUNCTION pun_invite_prepare(uuid,text,text,text,text),pun_invite_accept(text),pun_invite_revoke(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION pun_invite_prepare(uuid,text,text,text,text),pun_invite_accept(text),pun_invite_revoke(uuid) TO authenticated;');
  const coord=await readFile('prepared/exec01b/coordination.sql','utf8');
  await db.unsafe(coord.slice(coord.indexOf('CREATE TABLE public.submission_reception_reservations'),coord.indexOf('CREATE TABLE public.submission_reception_operations')));
  const base=await readFile('src/test/fixtures/exec02-base.sql','utf8');
  await db.unsafe(base.slice(base.indexOf('CREATE TABLE request_followups'),base.indexOf('CREATE TABLE crm_notifications')));
  await db.unsafe(coord.slice(coord.indexOf('CREATE FUNCTION public.exec02_exception'),coord.indexOf('-- One service RPC')));
  for(const path of ['R4B-COMPOSITION-NON-APPLIQUEE.sql','INSTALLATION-NON-APPLIQUEE.sql','R4C-INVITATIONS-NON-APPLIQUEES.sql']) await db.unsafe(await readFile('prepared/reprise-r3-r4/'+path,'utf8'));
  const as=<T>(user:string,fn:(tx:postgres.TransactionSql)=>Promise<T>)=>db.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${user},true)`;await tx.unsafe('SET LOCAL ROLE authenticated');return fn(tx);});
  // No network/sender: internal DB capture only. Never exported as a hosted mail adapter.
  const capture=async(invitation:string,token:string)=>{await db`insert into local_invitation_capture values(${invitation},${db.json({mode:'TEST_CAPTURE_ONLY',token})}) on conflict do nothing`;};
  return {db,as,capture,cleanup};
 }catch(error){await cleanup();throw error;}
}