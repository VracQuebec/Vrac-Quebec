import {readFile} from 'node:fs/promises';
import {createPunchLocal} from '../exec06/local-db';
export async function createHelpLocal(){
 if(process.env.EXEC07_LOCAL_TEST!=='1')throw Error('Explicit isolated EXEC07 required');
 const h=await createPunchLocal();
 try{
  for(const file of ['0152_agenda_lot_b.sql','0153_agenda_select_policy_fix.sql','0157_site_assistant_live.sql']){let sql=await readFile('drizzle/migrations/'+file,'utf8');
   // Only the local fixture lacks hosted realtime publication. No hosted source is changed.
   sql=sql.replace(/ALTER PUBLICATION supabase_realtime ADD TABLE[^;]+;/g,'');await h.db.unsafe(sql);}
  await h.db`insert into jsc_company_members(company_id,user_id,role,full_name,email) values(${h.ids.company},${h.employee},'operateur','Léa TEST','lea@test.invalid')`;
  const users:Record<string,string>={proprietaire:h.ids.user,operateur:h.employee,lecture:h.reader,aucun:h.ids.foreign};
  const slots:{id:string;start:string;end:string;label:string}[]=[];
  const capture=async(role:string,company:string,body:{kind:string;message:string;slot?:string|null;key:string})=>{
   const user=users[role];if(!user||company!==h.ids.company)throw Error('Contexte refusé');
   const membership=(await h.asUser(user,async tx=>tx`select entcrm_role(${company}::uuid) role`))[0].role;if(!membership||membership==='aucun')throw Error('Accès retiré');
   if(!['aide','amelioration','appel'].includes(body.kind)||!body.message.trim()||body.message.length>1500||body.key.length<8)throw Error('Demande invalide');
   const identity=user+':'+company+':'+body.key,payload=JSON.stringify(body);
   // All local writes are one DB transaction; only configured slots are eligible.
   const choice=body.slot?slots.find(s=>s.id===body.slot):null;if(body.slot&&(!choice||body.kind!=='appel'))throw Error('Créneau absent');
   const result=await h.db.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext(${identity}))`;
    const previous=await tx`select m.links from site_chat_messages m join site_chat_sessions s on s.id=m.session_id where s.user_id=${user} and m.links->>'exec07_key'=${identity}`;
    if(previous.length){if(previous[0].links.payload!==payload)throw Error('Identifiant réutilisé');return previous[0].links.result;}
    if(choice&&new Date(choice.start).getTime()<=Date.now())throw Error('Créneau expiré');
    if(choice)await tx`select pg_advisory_xact_lock(hashtext(${choice.id}))`;
    if(choice){const used=await tx`select id from agd_events where category='appel' and status<>'annule' and archived_at is null and start_at<${choice.end} and end_at>${choice.start}`;if(used.length)throw Error('Créneau déjà réservé');}
    const s=(await tx`insert into site_chat_sessions(user_id,audience,mode,wants_human,page,contact,msg_count) values(${user},'entrepreneur','humain',false,'/entrepreneur/aide',null,2) returning id`)[0];
    await tx`insert into site_chat_messages(session_id,role,content,author) values(${s.id},'visiteur',${'TEST · '+body.kind+' · '+body.message.trim()},${user}),(${s.id},'systeme','Capture TEST uniquement. Aucun agent averti, aucun envoi, aucune réponse IA.',null)`;
    let event=null;
    if(choice){await tx`select set_config('request.jwt.claim.sub',${user},true)`;const e=(await tx`insert into agd_events(company_id,title,description,category,status,start_at,end_at,owner_user_id,reminders,notify_client) values(${company},'Accompagnement Vrac Québec — TEST',${'Conversation TEST '+s.id},'appel','confirme',${choice.start},${choice.end},${user},'[]',false) returning id`)[0];event={id:e.id,label:choice.label};}
    const saved={sessionId:s.id,event,captureOnly:true};
    // Reuse message metadata under the transaction lock; no parallel capture table.
    await tx`update site_chat_messages set links=${JSON.stringify({exec07_key:identity,payload,result:saved})}::jsonb where session_id=${s.id} and role='visiteur'`;
    return saved;
   });return result;
  };
  return {...h,users,slots,capture};
 }catch(e){await h.cleanup();throw e;}
}
