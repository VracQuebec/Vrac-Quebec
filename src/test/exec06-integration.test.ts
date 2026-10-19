import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {createPunchLocal} from '../../prepared/exec06/local-db';
describe.skipIf(process.env.EXEC06_LOCAL_TEST!=='1')('EXEC-06 SQL isolé',()=>{
 let h:Awaited<ReturnType<typeof createPunchLocal>>;
 beforeAll(async()=>{h=await createPunchLocal()},60000);afterAll(async()=>{if(h)await h.cleanup()});
 const call=(u:string,sql:string)=>h.asUser(u,async tx=>(await tx.unsafe(sql))[0]);
 const inviteToken='fictive-employee-invitation-token-xxxxxxxxxxxxxxxxxxxxxxxx';
 it('invitation fictive liée à identité personnelle, sans doublon ni privilège général',async()=>{
 const q=`select pun_invite_prepare('${h.ids.company}','lea@test.invalid','operateur','invite-test-key','${inviteToken}') id`;
 const i=await call(h.ids.user,q);expect((await call(h.ids.user,q)).id).toBe(i.id);
 await expect(call(h.second,`select pun_invite_accept('${inviteToken}')`)).rejects.toThrow(/inaccessible/);
 const a=await call(h.employee,`select pun_invite_accept('${inviteToken}') id`);expect(a.id).toBe(h.ids.company);
 expect((await call(h.employee,`select pun_invite_accept('${inviteToken}') id`)).id).toBe(h.ids.company);
 expect((await call(h.employee,`select entcrm_can_finance('${h.ids.company}') f,entcrm_can_commercial('${h.ids.company}') c`))).toEqual({f:false,c:false});
 expect(await h.asUser(h.employee,async tx=>tx`select id from ent_crm_clients`)).toHaveLength(0);
 await expect(call(h.employee,q)).rejects.toThrow(/refusé/);
 });
 it('refuse hors entreprise, lecture seule et invitation vers un rôle financier',async()=>{
 await expect(call(h.ids.foreign,`select pun_in('${h.ids.company}','bureau',null,null,null,false,null,null,null)`)).rejects.toThrow(/refusé/);
 await expect(call(h.reader,`select pun_in('${h.ids.company}','bureau',null,null,null,false,null,null,null)`)).rejects.toThrow(/refusé/);
 await expect(call(h.ids.user,`select pun_invite_prepare('${h.ids.company}','lea@test.invalid','comptabilite','bad-invite','${inviteToken}2')`)).rejects.toThrow(/invalide/);
 });
 it('entrée répétée, pause répétée et reprise conservent un seul pointage et une vraie pause',async()=>{
 const sql=`select pun_in('${h.ids.company}','chantier','Activité TEST',null,null,false,null,null,null) id`;
 const e=await call(h.employee,sql);expect((await call(h.employee,sql)).id).toBe(e.id);
 await call(h.employee,`select pun_context_set('${e.id}','${h.project}','${h.task}')`);
 const p=await call(h.employee,`select pun_break('${h.ids.company}',true) id`);expect((await call(h.employee,`select pun_break('${h.ids.company}',true) id`)).id).toBe(p.id);
 await call(h.employee,`select pun_break('${h.ids.company}',false)`);await call(h.employee,`select pun_out('${h.ids.company}',null,null,null)`);
 expect(Number((await h.db`select count(*) n from pun_entries where kind='travail'`)[0].n)).toBe(1);
 expect((await h.db`select work_entry_id,ended_at,geo_consent from pun_entries where id=${p.id}`)[0]).toMatchObject({work_entry_id:e.id,geo_consent:false});
 expect((await h.db`select ended_at from pun_entries where id=${p.id}`)[0].ended_at).not.toBeNull();
 await expect(call(h.second,`select pun_context_set('${e.id}',null,null)`)).rejects.toThrow(/refusé/);
 });
 const manual=(u:string,s:string,e:string)=>call(h.ids.user,`select pun_manual('${h.ids.company}','${u}','travail','${s}','${e}','chantier','TEST',null,'Oubli fictif',null) id`);
 it('passage minuit découpe les heures dans les deux journées Toronto',async()=>{
 const e=await manual(h.employee,'2026-10-11T23:00:00-04:00','2026-10-12T01:00:00-04:00');
 await call(h.ids.user,`select pun_decide('${h.ids.company}',ARRAY['${e.id}']::uuid[],true,null)`);
 for(const d of ['2026-10-11','2026-10-12']){const a=await call(h.employee,`select * from pun_summary('${h.ids.company}','${d}','${d}')`);expect(Number(a.approved_min)).toBe(60);}
 });
 it('changement heure Toronto mesure une heure au printemps et trois à automne',async()=>{
 for(const [s,e,d,m] of [['2026-03-08T01:30:00-05:00','2026-03-08T03:30:00-04:00','2026-03-08',60],['2025-11-02T00:30:00-04:00','2025-11-02T02:30:00-05:00','2025-11-02',180]]){
 const x=await manual(h.second,String(s),String(e));await call(h.ids.user,`select pun_decide('${h.ids.company}',ARRAY['${x.id}']::uuid[],true,null)`);
 const a=await call(h.second,`select * from pun_summary('${h.ids.company}','${d}','${d}')`);expect(Number(a.approved_min)).toBe(m);
 }
 });
 it('chevauchement et client étranger sont refusés',async()=>{
 await expect(manual(h.employee,'2026-10-11T23:30:00-04:00','2026-10-12T00:30:00-04:00')).rejects.toThrow(/Chevauche/);
 await expect(call(h.ids.user,`select pun_manual('${h.ids.company}','${h.employee}','travail','2026-10-10T10:00:00-04:00','2026-10-10T11:00:00-04:00','bureau',null,'${h.ids.foreignClient}','Oubli fictif',null)`)).rejects.toThrow(/inaccessible/);
 });
 it('correction après approbation conserve original, export figé et alerte de remplacement',async()=>{
 const old=(await h.db`select id from pun_entries where user_id=${h.employee} and started_at='2026-10-12T03:00:00Z'`)[0].id;
 const q=`select pun_export_prepare('${h.ids.company}','2026-10-11','2026-10-12','export-test-key') r`;
 const exp=(await call(h.ids.user,q)).r;expect((await call(h.ids.user,q)).r.id).toBe(exp.id);
 const c=(await call(h.employee,`select pun_correction_request('${old}','2026-10-11T22:00:00-04:00','2026-10-12T01:00:00-04:00','Entrée oubliée TEST','correction-key') id`)).id;
 await expect(call(h.employee,`select pun_correction_decide('${c}',true,'Validation TEST')`)).rejects.toThrow(/refusé/);
 const replacement=(await call(h.ids.user,`select pun_correction_decide('${c}',true,'Validation TEST') id`)).id;
 expect((await h.db`select archived_at from pun_entries where id=${old}`)[0].archived_at).not.toBeNull();
 expect((await h.db`select status from pun_entries where id=${replacement}`)[0].status).toBe('soumis');
 const after=(await h.db`select * from pun_exports where id=${exp.id}`)[0];expect(after.stale).toBe(true);expect(after.snapshot).toEqual(exp.snapshot);
 expect((await call(h.ids.user,`select pun_correction_decide('${c}',true,'Validation TEST') id`)).id).toBe(replacement);
 expect(Number((await h.db`select count(*) n from pun_log where action='correction_detail' and entry_id=${replacement}`)[0].n)).toBe(1);
 });
 it('paie finalisée bloque modification des heures sans altérer le document',async()=>{
 const e=await manual(h.second,'2026-10-01T09:00:00-04:00','2026-10-01T10:00:00-04:00');
 await h.db`insert into pay_runs(company_id,period_from,period_to,pay_date,rate_year,status) values(${h.ids.company},'2026-10-01','2026-10-01','2026-10-02',2026,'finalise')`;
 await expect(call(h.ids.user,`select pun_decide('${h.ids.company}',ARRAY['${e.id}']::uuid[],true,null)`)).rejects.toThrow(/finalisée/);
 expect((await h.db`select status from pun_entries where id=${e.id}`)[0].status).toBe('soumis');
 });
 it('révocation bloque lectures, sortie, pauses, résumé, acceptation rejouée, archives conservées',async()=>{
 await call(h.ids.user,`select entcrm_set_member('${h.ids.company}','lea@test.invalid','operateur',false)`);
 expect(await h.asUser(h.employee,async tx=>tx`select id from pun_entries where company_id=${h.ids.company}`)).toHaveLength(0);
 expect(await h.asUser(h.employee,async tx=>tx`select * from pun_summary(${h.ids.company}::uuid,'2026-10-01','2026-10-19')`)).toHaveLength(0);
 for(const sql of [`select pun_out('${h.ids.company}',null,null,null)`,`select pun_break('${h.ids.company}',true)`,`select pun_invite_accept('${inviteToken}')`])await expect(call(h.employee,sql)).rejects.toThrow(/refusé|retiré/);
 expect(Number((await h.db`select count(*) n from pun_entries where user_id=${h.employee}`)[0].n)).toBeGreaterThan(0);
 });
});
