import {createHelpLocal} from './local-db';
const h=await createHelpLocal();let role='proprietaire';
const headers={'Access-Control-Allow-Origin':'http://localhost:8080','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const session=()=>({role,userId:h.users[role],companyId:h.ids.company,isolation:h.isolation});
const server=Bun.serve({hostname:'127.0.0.1',port:55447,async fetch(req){const u=new URL(req.url);if(req.headers.get('Origin')&&req.headers.get('Origin')!=='http://localhost:8080')return new Response('Origin denied',{status:403});if(req.method==='OPTIONS')return new Response(null,{headers});try{
 if(u.pathname==='/session'&&req.method==='GET')return Response.json(session(),{headers});
 if(u.pathname==='/slots'&&req.method==='GET')return Response.json({slots:h.slots.map(s=>({id:s.id,label:s.label}))},{headers});
 if(u.pathname==='/identity'&&req.method==='POST'){const p=await req.json();if(!h.users[p.role])throw Error('Identité fictive requise');role=p.role;return Response.json(session(),{headers});}
 if(u.pathname==='/capture'&&req.method==='POST'){const body=await req.json();if(body.role!==role)throw Error('Identité différente');return Response.json(await h.capture(role,body.companyId,body),{headers});}
 // Test operator explicitly configures fictional slots; never infer live availability.
 if(u.pathname==='/configure-slots'&&req.method==='POST'){if(role!=='proprietaire')throw Error('Configuration propriétaire TEST seulement');const p=await req.json();if(!Array.isArray(p.slots))throw Error('Créneaux requis');for(const s of p.slots){if(!s.id||!s.label||!(new Date(s.end).getTime()>new Date(s.start).getTime())||new Date(s.start).getTime()<=Date.now())throw Error('Créneau invalide ou expiré');}h.slots.splice(0,h.slots.length,...p.slots);return Response.json({configured:h.slots.length},{headers});}
 if(u.pathname==='/proof'&&req.method==='GET'){if(role!=='proprietaire')throw Error('Lecture interne TEST refusée');return Response.json({sessions:await h.db`select id,mode,page from site_chat_sessions`,messages:await h.db`select session_id,role,content from site_chat_messages`,events:await h.db`select id,title,status,start_at,notify_client,reminders from agd_events`,log:await h.db`select event_id,action from agd_event_log`,deliveries:await h.db`select count(*) n from agd_deliveries`},{headers});}
 return new Response('Not found',{status:404,headers});
 }catch(e){return Response.json({message:e instanceof Error?e.message:'Refus TEST'},{status:400,headers});}}});
console.log('EXEC07 disposable loopback ready',h.name);const stop=async()=>{server.stop(true);await h.cleanup();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
