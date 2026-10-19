import { readFile } from 'node:fs/promises';
import { createFinanceLocal } from '../exec05/local-db';
export async function createPunchLocal(){
 if(process.env.EXEC06_LOCAL_TEST!=='1')throw Error('Explicit isolated test mode required');
 const h=await createFinanceLocal();
 try{
 // Auth is only a disposable fixture. No managed auth objects are ever modified.
 await h.db.unsafe('CREATE TABLE auth.users(id uuid PRIMARY KEY,email text); CREATE UNIQUE INDEX local_member_unique ON jsc_company_members(company_id,user_id);');
 await h.db`insert into auth.users values(${h.ids.user},'employeur@test.invalid'),(${h.ids.foreign},'autre@test.invalid')`;
 await h.db.unsafe(await readFile('drizzle/migrations/0154_punch_lot_c1.sql','utf8'));
 await h.db.unsafe(await readFile('drizzle/migrations/0155_payroll_lot_c2.sql','utf8'));
 await h.db.unsafe(await readFile('prepared/exec06/schema.sql','utf8'));
 const employee=crypto.randomUUID(),second=crypto.randomUUID(),reader=crypto.randomUUID();
 await h.db`insert into auth.users values(${employee},'lea@test.invalid'),(${second},'marc@test.invalid'),(${reader},'lecture@test.invalid')`;
 await h.db`insert into jsc_company_members(company_id,user_id,role,full_name,email) values(${h.ids.company},${second},'operateur','Marc TEST','marc@test.invalid'),(${h.ids.company},${reader},'lecture','Lecture TEST','lecture@test.invalid')`;
 const project=(await h.asUser(h.ids.user,async tx=>tx`insert into ent_crm_projects(company_id,client_id,name) values(${h.ids.company},${h.ids.client},'Chantier TEST') returning id`))[0].id;
 const task=(await h.asUser(h.ids.user,async tx=>tx`insert into ent_crm_tasks(company_id,project_id,title,assignee_user_id) values(${h.ids.company},${project},'Excavation TEST',${employee}) returning id`))[0].id;
 return {...h,employee,second,reader,project,task};
 }catch(e){await h.cleanup();throw e;}
}
