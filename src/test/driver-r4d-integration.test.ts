// @vitest-environment node
import {it,expect} from 'vitest';
import {createR4CLocal} from '../../prepared/reprise-r3-r4/r4c-local';
import {captureDriverTestMessage} from '../../prepared/reprise-r3-r4/capture-worker';
it.skipIf(process.env.REQUEST_WORKBENCH_LOCAL!=='1')('chaîne intégrée SQL R4D + file/capture simulée, pas Auth/Storage réelles',async()=>{
 const h=await createR4CLocal();const {db,as}=h;
 const company=crypto.randomUUID(),manager=crypto.randomUUID(),driver=crypto.randomUUID(),user=crypto.randomUUID(),truck=crypto.randomUUID(),sub=crypto.randomUUID(),site=crypto.randomUUID(),request=crypto.randomUUID();
 const token=crypto.randomUUID()+crypto.randomUUID(),key=crypto.randomUUID();
 try{
 await db`insert into jsc_companies values(${company},'TEST R4D')`;
 await db`insert into auth.users values(${manager},'gestion@test.invalid',now()),(${user},'conducteur@test.invalid',now())`;
 await db`insert into jsc_company_members(company_id,user_id,role)values(${company},${manager},'proprietaire')`;
 await db`insert into jsc_drivers(id,company_id,first_name)values(${driver},${company},'TEST')`;
 await db`insert into jsc_trucks(id,company_id,name)values(${truck},${company},'TEST')`;
 const inviteCall=()=>as(manager,async tx=>(await tx`select driver_invite_capture(${company}::uuid,${driver}::uuid,'conducteur@test.invalid',${key},${token},'http://localhost:8080',NULL) r`)[0].r);
 await db`update local_queue_failure set enabled=true`;await expect(inviteCall()).rejects.toThrow('capture indisponible');expect(await db`select * from ent_employee_invites`).toHaveLength(0);
 await db`update local_queue_failure set enabled=false`;const inv=await inviteCall();expect(inv.delivery).toBe('queued-test');await inviteCall();expect(await db`select * from local_email_capture`).toHaveLength(1);
 const msg=(await db`select * from local_email_capture`)[0];
 expect(await captureDriverTestMessage(msg.payload,{receipt:async value=>{await db`insert into email_send_log(message_id,template_name,recipient_email,status,metadata)values(${String(value.message_id)},'driver-invitation-test','conducteur@test.invalid','suppressed',${db.json(value.metadata as never)})`;},remove:async()=>{await db`delete from local_email_capture where id=${msg.id}`;}})).toBe(true);
 expect((await db`select metadata from email_send_log where status='suppressed'`)[0].metadata.capture_result).toBe('captured-test');
 expect((await as(user,tx=>tx`select driver_invite_accept(${token}) r`))[0].r.user_id).toBe(user);
 await db.begin(async tx=>{await tx`select set_config('vq.workbench','on',true)`;await tx`insert into submissions(id,created_by,status,availability_status,materials,address,quantity_value,quantity_unit,edit_company_id)values(${sub},${manager},'nouveau','available',ARRAY['Terre'],'Chantier TEST',100,'m3',${company})`;});
 await db`insert into transport_requests(id,origin_submission_id,lifecycle_status,request_number)values(${request},${sub},'confirmee','TEST')`;await db`insert into submission_site_decisions(submission_id,site_id,status)values(${sub},${site},'approuvee')`;
 const values={company_id:company,request_id:request,driver_id:driver,truck_id:truck,destination_id:site,material:'Terre',quantity:10,unit:'m3',starts_at:'2026-11-01T12:00:00Z',instructions:'TEST'};
 await as(manager,tx=>tx`select requisition_assign(${request}::uuid,${company}::uuid,1,${tx.json(values)},${crypto.randomUUID()}::uuid,true)`);
 const action=(who:string,a:string,v:number)=>as(who,async tx=>(await tx`select requisition_action(${request}::uuid,${company}::uuid,${v},${a},'TEST',${crypto.randomUUID()}::uuid,true) r`)[0].r);
 await action(manager,'transmit',2);await action(user,'accept',3);
 await as(manager,tx=>tx`select submission_edit_save(${sub}::uuid,${company}::uuid,1,'{"access_instructions":"Accès changé TEST"}'::jsonb,${crypto.randomUUID()}::uuid,true)`);
 expect((await db`select requisition_state from transport_requests`)[0].requisition_state).toBe('revalidation');await expect(action(user,'start',5)).rejects.toThrow();
 // Coordination explicitly revalidates the destination before retransmission.
 await db`update submission_site_decisions set status='approuvee'`;await db`update submissions set revalidation_requested_at=NULL`;
 let version=(await db`select requisition_version from transport_requests`)[0].requisition_version;
 await action(manager,'transmit',version);await action(user,'accept',version+1);
 const mid=(await as(user,tx=>tx`select driver_tracking_start(${request}::uuid,true) r`))[0].r;
 await action(user,'start',version+2);await action(user,'complete',version+3);
 // Existing point/end/batch RPCs must reject after terminal mission, never infer a delivery.
 await expect(as(user,tx=>tx`select drv_mission_point(${mid}::uuid,0,0,10,now())`)).rejects.toMatchObject({code:'42501'});
 await as(manager,tx=>tx`select driver_invite_revoke(${inv.id}::uuid)`);
 expect(await as(user,tx=>tx`select * from drv_missions where id=${mid}`)).toHaveLength(0);
 expect(await as(user,tx=>tx`select * from jsc_notifications`)).toHaveLength(0);
 expect((await as(user,tx=>tx`select requisition_read(${company}::uuid) r`))[0].r).toEqual([]);
 await expect(as(user,tx=>tx`select drv_mission_end(${mid}::uuid)`)).rejects.toMatchObject({code:'42501'});
 await expect(as(user,tx=>tx`select drv_points_batch(${mid}::uuid,'[]'::jsonb,'web')`)).rejects.toMatchObject({code:'42501'});
 await expect(as(user,tx=>tx`select driver_invite_accept(${token})`)).rejects.toMatchObject({code:'42501'});
 expect(await db`select * from transport_request_events where action='requisition_complete'`).toHaveLength(1);expect(await db`select * from trips`).toHaveLength(0);
 }finally{await h.cleanup();}
},30000);