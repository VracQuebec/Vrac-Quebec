"""SQL RLS matrix: loopback disposable database, synthetic identities only."""
import json,subprocess,os,uuid,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]; env={**os.environ,'PGSSLMODE':'disable'}
cmd=['psql','-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55459','-U','postgres','-d','postgres','-At']
def sql(s):
 r=subprocess.run(cmd,input=s,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
assert '/tmp/r4k-select-pg/data' in sql("select current_setting('data_directory')")
a=json.load(open(ROOT/'docs/audit/r4k-select-preuves/serveur-avant.json'))
setup="""CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TYPE app_role AS ENUM('admin','user');
CREATE TABLE user_roles(user_id uuid,role app_role,approved boolean);
CREATE TABLE entrepreneurs(id uuid,user_id uuid,created_at timestamptz default now());
CREATE TABLE jsc_company_members(company_id uuid,user_id uuid,role text,is_active boolean default true,archived_at timestamptz);
CREATE TABLE jsc_drivers(id uuid,company_id uuid,user_id uuid,is_active boolean default true,archived_at timestamptz);
CREATE TABLE transport_requests(id uuid,requisition_company_id uuid,requisition_driver_id uuid,requisition_state text);
CREATE TABLE drv_missions(id uuid default gen_random_uuid(),user_id uuid default auth.uid(),entrepreneur_id uuid,submission_id uuid,driver_label text,truck_label text,consent_at timestamptz,ended_at timestamptz,company_id uuid,requisition_id uuid);
CREATE TABLE drv_points(mission_id uuid,lat float8,lng float8,accuracy float8,recorded_at timestamptz);
CREATE TABLE history(id integer,event text);
CREATE FUNCTION workbench_manager(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=c AND user_id=auth.uid() AND is_active AND archived_at IS NULL AND role IN('proprietaire','gestionnaire'))$$;
GRANT SELECT ON drv_missions,jsc_drivers TO authenticated;
ALTER TABLE drv_missions ENABLE ROW LEVEL SECURITY;
"""
# Exact server definitions for SELECT dependencies; workbench_manager is an explicit fixture seam (no subscription in this matrix).
for name in ['has_role','cpn_my_entrepreneur','fleet_member_role','driver_company_active','requisition_access','driver_mission_access']:
 setup+=next(h['definition'] for h in a['helpers'] if h['signature'].startswith(name+'('))+';\n'
setup+='CREATE POLICY "missions read" ON drv_missions FOR SELECT TO authenticated USING '+a['policies'][0]['using']+';'
# Existing ordinary RPCs copied byte-for-byte from server snapshot.
deps=(ROOT/'docs/audit/r4k-select-preuves/dependances-avant.sql').read_text()
setup+=deps[:deps.index('CREATE OR REPLACE FUNCTION public.entcrm_can_write')].replace('$function$\n','$function$;\n')
sql('CREATE DATABASE select_matrix_2;')
cmd[-2]='select_matrix_2'
sql(setup)
u=[str(uuid.uuid4()) for _ in range(10)];driver,driver2,manager,other,admin,entA,entB,ca,cb,da=u; db=str(uuid.uuid4()); rq,rqb,normal,ownbad,otherm,rm,rmb=[str(uuid.uuid4()) for _ in range(7)]
sql(f"""INSERT INTO user_roles VALUES('{admin}','admin',true);
INSERT INTO entrepreneurs(id,user_id) VALUES('{entA}','{manager}'),('{entB}','{other}');
INSERT INTO jsc_company_members(company_id,user_id,role) VALUES('{ca}','{manager}','gestionnaire'),('{cb}','{other}','proprietaire'),('{ca}','{driver}','chauffeur'),('{cb}','{driver2}','chauffeur');
INSERT INTO jsc_drivers(id,company_id,user_id) VALUES('{da}','{ca}','{driver}'),('{db}','{cb}','{driver2}');
INSERT INTO transport_requests VALUES('{rq}','{ca}','{da}','running'),('{rqb}','{cb}','{db}','running');
INSERT INTO drv_missions(id,user_id,entrepreneur_id,company_id,requisition_id,consent_at) VALUES('{normal}','{manager}','{entA}','{ca}',NULL,now()),('{ownbad}','{driver}',NULL,'{ca}',NULL,now()),('{otherm}','{other}','{entB}','{cb}',NULL,now()),('{rm}','{driver}',NULL,'{ca}','{rq}',now()),('{rmb}','{driver2}',NULL,'{cb}','{rqb}',now());
INSERT INTO drv_points VALUES('{rm}',0,0,10,now()),('{rm}',0.001,0.001,10,now()); INSERT INTO history VALUES(1,'completed');""")
results=[]
def check(n,ok):results.append({'test':n,'passed':ok});assert ok,n
def read(uid):return set(sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true); SELECT id FROM drv_missions ORDER BY id; ROLLBACK;").splitlines())-{'BEGIN','SET',uid,'ROLLBACK'}
check('Defect reproduced: driver sees own ordinary row',ownbad in read(driver))
new=(ROOT/'prepared/securite-r4k/predicate.txt').read_text().strip()
sql('ALTER POLICY "missions read" ON drv_missions USING '+new+';')
check('Driver only own requisition mission',read(driver)=={rm})
check('Other driver only own company requisition',read(driver2)=={rmb})
check('Manager own ordinary mission',read(manager)=={normal})
check('Other company cannot see A',read(other)=={otherm})
check('Admin intentional read preserved',len(read(admin))==5)
sql(f"UPDATE jsc_company_members SET is_active=false WHERE user_id='{driver}';")
check('Revocation immediate without JWT change',read(driver)==set())
sql(f"UPDATE jsc_company_members SET is_active=false WHERE user_id='{manager}';")
check('Revoked manager scoped company refused',read(manager)==set())
sql(f"UPDATE jsc_company_members SET is_active=true WHERE user_id='{manager}';")
r=sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{manager}',true); SELECT drv_mission_start(NULL,'Fictif','Camion',true); ROLLBACK;")
check('Ordinary start RPC preserved',normal in r)
sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{manager}',true); SELECT drv_mission_point('{normal}',0,0,10,now()); SELECT drv_mission_end('{normal}'); COMMIT;")
check('Ordinary point and end preserved',sql(f"SELECT ended_at IS NOT NULL FROM drv_missions WHERE id='{normal}'")=='t')
check('History and two positions preserved',sql(f"SELECT (SELECT count(*) FROM drv_points WHERE mission_id='{rm}')=2 AND (SELECT count(*) FROM history)=1 AND (SELECT count(*) FROM drv_missions)=5")=='t')
sql((ROOT/'prepared/securite-r4k/retour/0245.sql').read_text())
check('Rollback exact predicate',sql("select md5(pg_get_expr(polqual,polrelid)) from pg_policy where polname='missions read'")=='73dcff744eb3ec0259e79d48f0dde1ea')
print(json.dumps({'environment':'isolated 127.0.0.1:55459; synthetic fixtures; real server SELECT helpers; workbench membership seam; not hosted Auth','results':results},indent=2))
