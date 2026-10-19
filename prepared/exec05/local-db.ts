import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";

export async function createFinanceLocal() {
  if (process.env.EXEC05_LOCAL_TEST !== "1") throw Error("Explicit isolated test mode required");
  const root = postgres("postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable", { ssl: false, max: 1 });
  const iso = (await root`select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') path`)[0];
  if (iso.host !== "127.0.0.1" || Number(iso.port) !== 55439 || !iso.path.startsWith("/tmp/exec-correctifs/")) { await root.end(); throw Error("Isolation not proven"); }
  const name = "exec05_" + crypto.randomUUID().replace(/-/g, "");
  await root.unsafe(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`); await root.end();
  const db = postgres(`postgresql://lovable@127.0.0.1:55439/${name}?sslmode=disable`, { ssl: false, max: 1 });
  const cleanup = async () => { await db.end(); const r = postgres("postgresql://lovable@127.0.0.1:55439/postgres?sslmode=disable", { ssl: false });
    const v = (await r`select current_setting('data_directory') path`)[0]; if (!v.path.startsWith("/tmp/exec-correctifs/") || !/^exec05_[a-f0-9]{32}$/.test(name)) throw Error("Cleanup isolation failed");
    await r.unsafe(`DROP DATABASE ${name} WITH (FORCE)`); await r.end(); };
  try {
    await db.unsafe(await readFile("prepared/exec05/local-base.sql", "utf8"));
    // Full original CRM/finance migrations, not replacement calculation or receipt stubs.
    const files = (await readdir("drizzle/migrations")).sort();
    const ids = [45,47,48,57,67,75,76,82,83,...Array.from({length:65},(_,i)=>84+i).filter(i=>![118,119,120].includes(i))];
    for (const id of ids) { const f = files.find(f => Number(f.slice(0,4)) === id); if (!f) throw Error(`Migration ${id} absent`);
      console.log("Applying local", f); await db.unsafe(await readFile(`drizzle/migrations/${f}`, "utf8")); }
    await db.unsafe(await readFile("prepared/exec05/invoices.sql", "utf8"));
    await db.unsafe("CREATE POLICY own ON ent_crm_templates FOR ALL TO authenticated USING(entcrm_can_write(company_id)) WITH CHECK(entcrm_can_write(company_id));");
    // Reuse exactly the existing EXEC-02 local queue capture fixture, never pgmq/provider.
    const capture = (await readFile("src/test/fixtures/exec02-base.sql","utf8")).split("\n").filter(l=>/^CREATE TABLE local_email_capture|^CREATE TABLE local_queue_failure|^CREATE FUNCTION enqueue_email/.test(l)).join("\n");
    await db.unsafe(capture);
    const idsOut = { company: crypto.randomUUID(), other: crypto.randomUUID(), user: crypto.randomUUID(), foreign: crypto.randomUUID(), client: crypto.randomUUID(), foreignClient: crypto.randomUUID(), account: crypto.randomUUID() };
    for (const [id,n] of [[idsOut.company,"Excavation Exemple — TEST"],[idsOut.other,"Entreprise distincte — TEST"]]) await db`insert into jsc_companies(id,name,legal_name,address,email) values(${id},${n},${n},'100, rue Fictive','entreprise@test.invalid')`;
    await db`insert into jsc_company_members(company_id,user_id,role) values(${idsOut.company},${idsOut.user},'proprietaire'),(${idsOut.other},${idsOut.foreign},'proprietaire')`;
    for (const c of [idsOut.company,idsOut.other]) await db`insert into ent_crm_settings(company_id,gst_status,qst_status,gst_number,qst_number,gst_effective,qst_effective) values(${c},'inscrit','inscrit','123456789RT0001','1234567890TQ0001','2026-01-01','2026-01-01')`;
    await db`insert into ent_crm_clients(id,company_id,name,email,address,city) values(${idsOut.client},${idsOut.company},'Camille Exemple','camille@test.invalid','200, rue Fictive','Québec'),(${idsOut.foreignClient},${idsOut.other},'Client étranger TEST','etranger@test.invalid','300, rue Fictive','Gatineau')`;
    await db`insert into fin_accounts(id,company_id,name) values(${idsOut.account},${idsOut.company},'Banque fictive')`;
    const asUser = async <T>(user: string, fn: (tx: any) => Promise<T>): Promise<T> => db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${user},true)`; await tx.unsafe("SET LOCAL ROLE authenticated"); return fn(tx);
    }) as Promise<T>;
    return { db, name, ids: idsOut, asUser, cleanup, isolation: iso };
  } catch (e) { await cleanup(); throw e; }
}