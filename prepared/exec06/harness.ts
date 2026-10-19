import {createPunchLocal} from './local-db';
const h=await createPunchLocal();
const users=new Set([h.ids.user,h.employee,h.second,h.reader,h.ids.foreign]);
const tables=new Set(['pun_entries','pun_log','pun_corrections','pun_exports','ent_employee_invites','jsc_company_members','ent_crm_clients']);
const rpcs=new Set(['pun_in','pun_out','pun_break','pun_manual','pun_manual_submit','pun_decide','pun_summary','pun_correction_request','pun_correction_decide','pun_export_prepare','pun_work_options','pun_context_set','pun_invite_prepare','pun_invite_accept','pun_invite_revoke','entcrm_set_member','entcrm_list_members','entcrm_role']);
const ident=(s:string)=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw Error('Identifier');return '"'+s+'"';};
const token='local-invitation-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
await h.asUser(h.ids.user,async tx=>tx`select pun_invite_prepare(${h.ids.company}::uuid,'lea@test.invalid','operateur','browser-invitation',${token})`);
const server=Bun.serve({hostname:'127.0.0.1',port:55446,async fetch(req){
 const headers={'Access-Control-Allow-Origin':'http://localhost:8080','Access-Control-Allow-Headers':'Content-Type,Authorization,apikey,x-client-info,Prefer,Accept,x-test-user,Content-Profile,Accept-Profile','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 const url=new URL(req.url);if(req.headers.get('Origin')&&req.headers.get('Origin')!=='http://localhost:8080')return new Response('Origin denied',{status:403});if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
 if(url.pathname==='/session')return Response.json({company:h.ids.company,other:h.ids.other,name:'Excavation Exemple — TEST',owner:h.ids.user,employee:h.employee,second:h.second,token,isolation:h.isolation},{headers});
 const user=req.headers.get('x-test-user')??'';if(!users.has(user))throw Error('Fictional identity required');
 const resource=url.pathname.split('/').pop()??'';
 const result=await h.asUser(user,async tx=>{
 if(url.pathname.includes('/rpc/')){if(!rpcs.has(resource))throw Error('RPC denied');const p=await req.json();const entries=Object.entries(p);const args=entries.map(([k],i)=>ident(k)+' => $'+(i+1)).join(',');const set=['pun_summary','entcrm_list_members'].includes(resource);const rows=await tx.unsafe(`select ${set?'* from ':''}${ident(resource)}(${args})${set?'':' value'}`,entries.map(([,v])=>Array.isArray(v)?'{'+v.join(',')+'}':v));return set?rows.map((r:any)=>({...r,...(r.week?{week:String(r.week).slice(0,10)}:{})})):rows[0]?.value??null;}
 if(!tables.has(resource)||req.method!=='GET')throw Error('Read-only table denied');const conditions:string[]=[];const vals:unknown[]=[];
 for(const [k,v]of url.searchParams){if(['select','order','limit','offset','or'].includes(k))continue;if(v==='is.null')conditions.push(ident(k)+' IS NULL');else if(v.startsWith('eq.')){vals.push(v.slice(3));conditions.push(ident(k)+'=$'+vals.length);}else throw Error('Filter denied');}
 const rows=await tx.unsafe('select * from '+ident(resource)+(conditions.length?' WHERE '+conditions.join(' AND '):'')+(resource==='pun_entries'?' ORDER BY started_at DESC':''),vals);return rows;
 });return Response.json(result,{headers});
 }catch(e){return Response.json({message:(e as Error).message},{status:400,headers});}
}});
console.log('EXEC06 isolated loopback ready',h.name);const stop=async()=>{server.stop(true);await h.cleanup();process.exit(0)};process.on('SIGTERM',stop);process.on('SIGINT',stop);
