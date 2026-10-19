// Disposable, loopback-only HTTP adapter for the real CRM/finance screens. Never deployed.
import { createFinanceLocal } from "./local-db";
import { captureInvoiceMail } from "./mail";
const h=await createFinanceLocal();
const files=new Map<string,Uint8Array>();
const tables=new Set(['ent_crm_clients','ent_crm_contacts','ent_crm_projects','ent_crm_leads','ent_crm_quotes','ent_crm_services','ent_crm_templates','ent_crm_files','ent_crm_file_links','fin_invoices','fin_expected_inflows','fin_credit_notes','fin_invoice_receipts','fin_accounts','fin_invoice_settings','fin_tax_rates','ent_crm_settings','jsc_companies','jsc_company_members','user_roles']);
const ident=(s:string)=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw Error('Invalid identifier');return '"'+s+'"';};
const functions=new Set(['entcrm_accept_quote','entcrm_project_from_quote','fin_invoice_draft_create','fin_invoice_from_quote','fin_invoice_issue','fin_invoice_receipt_add','fin_invoice_receipt_summary','fin_retention_summary','fin_credit_save','fin_credit_issue','fin_credit_discard','fin_progress_list','fin_progress_for_quote','fin_progress_plan_create','fin_progress_summary','fin_progress_draft_save','fin_progress_issue','fin_invoice_mark_sent']);
async function rest(req:Request,url:URL){
 const resource=url.pathname.split('/').pop()??'';
 if(url.pathname.includes('/rpc/')){
   if(!functions.has(resource))throw Error('Local RPC not allowed');
   const p=await req.json(); const entries=Object.entries(p);
   return h.asUser(h.ids.user,async tx=>{
     const args=entries.map(([k],i)=>`${ident(k)} => $${i+1}`).join(',');
     const rows=await tx.unsafe(`select ${ident(resource)}(${args}) value`,entries.map(([,v])=>v));return rows[0]?.value??null;
   });
 }
 if(!tables.has(resource))throw Error('Local table not allowed');
 return h.asUser(h.ids.user,async tx=>{
   const vals:unknown[]=[]; const where:string[]=[];
   for(const [k,v] of url.searchParams){if(['select','order','limit','offset','on_conflict','columns'].includes(k))continue;
     const col=ident(k);if(v==='is.null')where.push(`${col} IS NULL`);else if(v.startsWith('eq.')||v.startsWith('lte.')){vals.push(v.slice(v.startsWith('eq.')?3:4));where.push(`${col}${v.startsWith('eq.')?'=':'<='}$${vals.length}`);}else throw Error('Unsupported local filter');}
   const conditions=where.length?' WHERE '+where.join(' AND '):'';
   let rows:any[];
   if(req.method==='GET'||req.method==='HEAD'){
     rows=await tx.unsafe(`SELECT * FROM ${ident(resource)}${conditions}`,vals);
     for(const r of rows){
       if(resource==='ent_crm_clients')for(const t of ['ent_crm_contacts','ent_crm_projects','ent_crm_leads'])r[t]=await tx.unsafe(`SELECT * FROM ${ident(t)} WHERE client_id=$1`,[r.id]);
       if(resource==='ent_crm_quotes'){r.ent_crm_clients=(await tx`select name from ent_crm_clients where id=${r.client_id}`)[0]??null;r.ent_crm_projects=await tx`select id from ent_crm_projects where quote_id=${r.id}`;}
       if(resource==='fin_invoices'){r.fin_expected_inflows=r.expected_inflow_id?(await tx`select * from fin_expected_inflows where id=${r.expected_inflow_id}`)[0]:null;r.fin_credit_notes=await tx`select total,status from fin_credit_notes where invoice_id=${r.id}`;r.ent_crm_projects=r.project_id?(await tx`select name from ent_crm_projects where id=${r.project_id}`)[0]:null;}
     }
   }else{
     const raw=await req.text();const body=JSON.parse(raw);const list=Array.isArray(body)?body:[body];rows=[];
     for(const b of list){const keys=Object.keys(b);const values=keys.map(k=>b[k]);
       if(req.method==='POST')rows.push(...await tx.unsafe(`INSERT INTO ${ident(resource)}(${keys.map(ident).join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values));
       else if(req.method==='PATCH'){const set=keys.map((k,i)=>`${ident(k)}=$${vals.length+i+1}`).join(',');rows.push(...await tx.unsafe(`UPDATE ${ident(resource)} SET ${set}${conditions} RETURNING *`,[...vals,...values]));}
       else throw Error('Local write unsupported');
     }
   }
   if(req.headers.get('Accept')?.includes('object+json'))return rows[0]??null;return rows;
 });
}
const server=Bun.serve({hostname:'127.0.0.1',port:55445,async fetch(req){const url=new URL(req.url);const origin=req.headers.get('Origin');const headers={'Access-Control-Allow-Origin':'http://localhost:8080','Access-Control-Allow-Headers':'Content-Type,Authorization,apikey,x-client-info,Prefer,Accept','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'};
 if(origin&&origin!=='http://localhost:8080')return new Response('Foreign origin',{status:403});if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
   if(url.pathname==='/session')return Response.json({company:h.ids.company,name:'Excavation Exemple — TEST',user:h.ids.user},{headers});
   if(url.pathname==='/mail') {const p=await req.json();return Response.json(await captureInvoiceMail(h.db,h.ids.user,p.invoice,p.key,p.mail),{headers});}
   if(url.pathname==='/proof')return Response.json({isolation:h.isolation,invoices:await h.db`select * from fin_invoices`,inflows:await h.db`select * from fin_expected_inflows`,receipts:await h.db`select * from fin_invoice_receipts`,captures:await h.db`select * from local_email_capture`},{headers});
   if(url.pathname.startsWith('/storage/')){const path=url.pathname;if(req.method==='POST'){if(files.has(path))return Response.json({message:'Duplicate'},{status:409,headers});files.set(path,new Uint8Array(await req.arrayBuffer()));return Response.json({Key:path},{headers});}const file=files.get(path);return file?new Response(file,{headers:{...headers,'Content-Type':'application/pdf'}}):new Response('Absent',{status:404,headers});}
   const result=await rest(req,url);
   const json=JSON.stringify(result,(k,v)=>['issue_date','due_date','received_on','expected_on','effective_from','valid_until','created_on'].includes(k)&&typeof v==='string'?v.slice(0,10):v);
   return new Response(json,{headers:{...headers,'Content-Type':'application/json'}});
 }catch(e){return Response.json({message:(e as Error).message},{status:400,headers});}
}});
console.log('EXEC05 loopback ready',h.name);
const stop=async()=>{server.stop(true);await h.cleanup();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);