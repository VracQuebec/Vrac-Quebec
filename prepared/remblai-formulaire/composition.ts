// Inactive SQL artifact generator. No connection or deployment on import.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export type Reference={signature:string;definition:string;md5:string;owner:string;acl:string;returns:string;config:string[];security_definer:boolean};
export const digestDefinition=(text:string)=>createHash('md5').update(text).digest('hex');
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export function guard(refs:Reference[]):string {
 return `DO $guard$ BEGIN\n${refs.map(r=>`IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=${literal('public.'+r.signature)}::regprocedure AND md5(pg_get_functiondef(p.oid))=${literal(r.md5)} AND r.rolname=${literal(r.owner)} AND p.proacl::text=${literal(r.acl)} AND pg_get_function_result(p.oid)=${literal(r.returns)} AND p.prosecdef=${r.security_definer} AND to_jsonb(p.proconfig)=${literal(JSON.stringify(r.config))}::jsonb AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'REFERENCE_OR_RIGHTS_DRIFT_STOP'; END IF;`).join('\n')}\nEND $guard$;\n`;
}
export async function assemble(sql:{unsafe:(s:string)=>Promise<unknown>},refs:Reference[]) {
 const connection=await sql.unsafe("SELECT current_setting('data_directory') AS directory, inet_server_addr()::text AS host, inet_server_port() AS port") as {directory:string;host:string;port:number}[];
 const target=connection[0];
 if(process.env.REMBLAI_FORM_LOCAL!=='1'||!target?.directory.startsWith('/tmp/remblai-form-')||!['127.0.0.1','127.0.0.1/32'].includes(target.host)||target.port!==55438)throw Error('DISPOSABLE_LOOPBACK_REQUIRED');
 const selected=refs.filter(r=>['exec01_dispatch(jsonb)','exec01_projection(uuid,boolean)','exec01_enqueue_confirmation(jsonb)'].includes(r.signature));
 if(selected.length!==3)throw Error('Missing exact reference');
 for(const r of selected)if(digestDefinition(r.definition)!==r.md5)throw Error('Invalid reference fingerprint');
 let state=selected.map(r=>({...r}));const baseline=state.map(r=>({...r}));
 const stages:{name:string;before:Reference[];after:Reference[];sql:string}[]=[];
 const capture=async()=>Promise.all(state.map(async r=>{
  const rows=await sql.unsafe(`SELECT pg_get_functiondef(${literal('public.'+r.signature)}::regprocedure) AS definition`) as {definition:string}[];
  const definition=rows[0]?.definition;if(!definition)throw Error('Missing function');
  return {...r,definition,md5:digestDefinition(definition)};
 }));
 const patches=[['01-renouvellement','prepared/exec01-correctif-lien/0231_renouvellement_premiere_verification.sql'],['02-duree','prepared/exec01-correctif-lien/0232_lien_sans_expiration_NON_APPLIQUEE.sql'],['03-formulaire','prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql']];
 for(const [name,path] of patches){const before=state.map(r=>({...r}));const patch=await readFile(path,'utf8');await sql.unsafe(guard(state));await sql.unsafe(patch);state=await capture();stages.push({name,before,after:state.map(r=>({...r})),sql:patch});}
 const enqueue=state.find(r=>r.signature==='exec01_enqueue_confirmation(jsonb)');if(!enqueue||enqueue.definition.split("now()+interval '30 days'").length!==2)throw Error('Unexpected initial-link issuer');
 const patch=enqueue.definition.replace("now()+interval '30 days'","'infinity'::timestamptz")+';';const before=state.map(r=>({...r}));await sql.unsafe(guard(state));await sql.unsafe(patch);state=await capture();stages.push({name:'04-confirmation-initiale',before,after:state.map(r=>({...r})),sql:patch});
 const dir='prepared/remblai-formulaire/sql-compose';await mkdir(dir,{recursive:true});
 const header='-- PRÉPARATION UNIQUEMENT. NON APPLIQUÉ EN PRODUCTION. Autorisation distincte requise.\n-- Aucun GRANT, RLS, changement de table/index/colonne ni modification des dossiers existants.\n';
 await writeFile(`${dir}/ACTIVATION-NON-APPLIQUEE.sql`,header+'BEGIN;\n'+stages.map(s=>`-- ${s.name}\n`+guard(s.before)+s.sql+'\n'+guard(s.after)).join('\n')+'COMMIT;\n');
 await writeFile(`${dir}/RETOUR-COMPLET-NON-APPLIQUE.sql`,header+'-- N’annule aucune donnée ni échéance déjà enregistrée.\nBEGIN;\n'+guard(state)+baseline.map(r=>r.definition+';').join('\n')+guard(baseline)+'COMMIT;\n');
 for(const stage of stages)await writeFile(`${dir}/RETOUR-${stage.name}-NON-APPLIQUE.sql`,header+'BEGIN;\n'+guard(stage.after)+stage.before.filter(r=>stage.after.find(a=>a.signature===r.signature)?.md5!==r.md5).map(r=>r.definition+';').join('\n')+guard(stage.before)+'COMMIT;\n');
 await writeFile(`${dir}/empreintes.json`,JSON.stringify({baseline,stages:stages.map(({name,before,after})=>({name,before,after})),final:state},null,2)+'\n');
 return {baseline,final:state,guard};
}