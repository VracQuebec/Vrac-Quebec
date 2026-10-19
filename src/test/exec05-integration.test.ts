// Actual SQL functions on proven disposable loopback database; no hosted client.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createFinanceLocal } from "../../prepared/exec05/local-db";
import { captureInvoiceMail } from "../../prepared/exec05/mail";

describe.skipIf(process.env.EXEC05_LOCAL_TEST !== "1")("EXEC-05 SQL isolé", () => {
  let h: Awaited<ReturnType<typeof createFinanceLocal>>;
  beforeAll(async () => { h = await createFinanceLocal(); },60000);
  afterAll(async () => { if(h) await h.cleanup(); });
  const user = async (sql: string) => h.asUser(h.ids.user, async tx => (await tx.unsafe(sql))[0]);
  const quote = async (number: string) => {
    const row = await user(`insert into ent_crm_quotes(company_id,client_id,number,lines,status) values('${h.ids.company}','${h.ids.client}','${number}','[{"desc":"Excavation TEST","qty":10,"unit":"heure","price":100,"tax":"taxable"}]','brouillon') returning id`);
    await user(`update ent_crm_quotes set status='remise' where id='${row.id}' returning id`);
    await user(`select entcrm_accept_quote('${row.id}','Courriel fictif capturé','Camille Exemple')`); return row.id;
  };
  const direct = async (key: string) => {
    const { id } = await user(`select fin_invoice_draft_create('${h.ids.company}','direct-${key}','${h.ids.client}',null) id`);
    await user(`update fin_invoices set lines='[{"desc":"Prestation TEST","qty":2,"unit":"heure","price":100,"tax":"taxable"}]',issue_date='2026-10-19',due_date='2026-11-19',is_test=true where id='${id}' returning id`);
    await user(`select fin_invoice_issue('${id}',null)`); return id;
  };
  it("charge les vrais traitements et crée une facture directe une seule fois, refus interentreprises", async () => {
      const call = (user: string, company: string, client: string, key: string) => h.asUser(user, async tx => (await tx`select fin_invoice_draft_create(${company}::uuid,${key},${client}::uuid,null) id`)[0].id);
      const id = await call(h.ids.user,h.ids.company,h.ids.client,"direct-test-unique");
      expect(await call(h.ids.user,h.ids.company,h.ids.client,"direct-test-unique")).toBe(id);
      expect(Number((await h.db`select count(*) n from fin_invoices`)[0].n)).toBe(1);
      await expect(call(h.ids.foreign,h.ids.company,h.ids.client,"foreign-test-key")).rejects.toThrow(/Accès refusé/);
      await expect(call(h.ids.user,h.ids.company,h.ids.foreignClient,"foreign-client-key")).rejects.toThrow(/Client inaccessible/);
  },60000);
  it("convertit une soumission acceptée sans doublon, ajuste le réel, fige le document émis", async () => {
    const q = await quote('S-TEST-01');
    const { id } = await user(`select fin_invoice_from_quote('${q}') id`);
    expect((await user(`select fin_invoice_from_quote('${q}') id`)).id).toBe(id);
    await user(`update fin_invoices set lines='[{"desc":"Réel TEST","qty":3,"unit":"heure","price":100,"tax":"taxable"}]',issue_date='2026-10-19',is_test=true where id='${id}' returning id`);
    await user(`select fin_invoice_issue('${id}',null)`);
    const before = (await h.db`select * from fin_invoices where id=${id}`)[0];
    expect(Number(before.total)).toBe(344.93);
    await user(`select fin_invoice_issue('${id}',null)`);
    expect(Number((await h.db`select count(*) n from fin_expected_inflows where invoice_id=${id}`)[0].n)).toBe(1);
    await expect(user(`update fin_invoices set lines='[]' where id='${id}' returning id`)).rejects.toThrow(/émise/);
    await expect(user(`update ent_crm_quotes set conditions='Condition révisée TEST' where id='${q}' returning id`)).rejects.toThrow(/révision/);
    await quote('S-TEST-01-REV');
    const after = (await h.db`select * from fin_invoices where id=${id}`)[0];
    expect(after.tax_snapshot).toEqual(before.tax_snapshot); expect(after.lines).toEqual(before.lines);
  });
  it("enregistre un paiement partiel puis le solde, rejoue sans deuxième règlement", async () => {
    const id = await direct('partial');
    const add = (amount: number,key: string) => user(`select fin_invoice_receipt_add('${id}',${amount},'2026-10-19','virement','${h.ids.account}',null,'${key}') r`);
    const a = (await add(100,'partial-key')).r; expect(Number(a.rest)).toBe(129.95);
    expect((await add(100,'partial-key')).r.id).toBe(a.id);
    await expect(add(101,'partial-key')).rejects.toThrow(/Clé de saisie/);
    const b = (await add(129.95,'balance-key')).r; expect(Number(b.rest)).toBe(0);
    expect(Number((await h.db`select count(*) n from fin_invoice_receipts where invoice_id=${id}`)[0].n)).toBe(2);
    expect(Number((await h.db`select received from fin_expected_inflows where invoice_id=${id}`)[0].received)).toBe(229.95);
    await expect(h.asUser(h.ids.foreign,async tx => tx`select fin_invoice_receipt_add(${id}::uuid,1,'2026-10-19','virement',null,null,'foreign')`)).rejects.toThrow(/Accès refusé/);
    expect(await h.asUser(h.ids.foreign,async tx => tx`select id from fin_invoices where company_id=${h.ids.company}`)).toHaveLength(0);
  });
  it("émet un avoir sur les taxes figées, sans doubler son effet", async () => {
    const id = await direct('credit');
    const { r } = await user(`select fin_credit_save('${id}','credit-key','Correction TEST','{"mode":"balance"}',null) r`);
    const issue = () => user(`select fin_credit_issue('${r.id}','credit-issue',${r.preview.total},${r.rev},'${r.hash}') r`);
    await issue(); expect((await issue()).r.replayed).toBe(true);
    expect(Number((await h.db`select count(*) n from fin_credit_notes where invoice_id=${id}`)[0].n)).toBe(1);
    expect(Number((await user(`select fin_invoice_receipt_summary('${id}') r`)).r.rest)).toBe(0);
    expect((await h.db`select archived_at from fin_expected_inflows where invoice_id=${id}`)[0].archived_at).not.toBeNull();
  });
  it("capture un courriel TEST une fois, refuse une reprise modifiée et une entreprise étrangère", async () => {
    const id=await direct('mail');const mail={to:'camille@test.invalid',subject:'Facture TEST',message:'Facture fictive sans envoi'};
    const a=await captureInvoiceMail(h.db,h.ids.user,id,'mail-test-key',mail);
    expect((await captureInvoiceMail(h.db,h.ids.user,id,'mail-test-key',mail)).id).toBe(a.id);
    await expect(captureInvoiceMail(h.db,h.ids.user,id,'mail-test-key',{...mail,subject:'Autre facture'})).rejects.toThrow(/autre courriel/);
    await expect(captureInvoiceMail(h.db,h.ids.foreign,id,'mail-foreign-key',mail)).rejects.toThrow(/autorisée/);
    await expect(captureInvoiceMail(h.db,h.ids.user,id,'mail-real-key',{...mail,to:'personne@domaine.ca'})).rejects.toThrow();
    expect(Number((await h.db`select count(*) n from local_email_capture`)[0].n)).toBe(1);
  });
  it("comptabilise facture, règlement et avoir une fois avec débits égaux aux crédits", async () => {
    const accounts:Record<string,string>={};
    for(const [role,category] of [['ar','actif'],['revenue','revenus'],['gst_payable','passif'],['qst_payable','passif'],['bank','actif']]){
      const a=(await user(`select fin_gl_account_save('${h.ids.company}',null,'TEST-${role.replace(/_/g,'-')}','${role} TEST','${category}',true) id`)).id;
      accounts[role]=a;
      if(role!=='bank')await user(`select fin_gl_map_set('${h.ids.company}','${role}','${a}')`);
    }
    await user(`select fin_gl_link_set('${h.ids.company}','${h.ids.account}','${accounts.bank}')`);
    const id=await direct('ledger');
    await user(`select fin_invoice_receipt_add('${id}',100,'2026-10-19','virement','${h.ids.account}',null,'ledger-payment')`);
    const {r}=await user(`select fin_credit_save('${id}','ledger-credit','Correction TEST','{"mode":"balance"}',null) r`);
    await user(`select fin_credit_issue('${r.id}','ledger-credit-issue',${r.preview.total},${r.rev},'${r.hash}')`);
    await user(`select fin_gl_sync('${h.ids.company}')`);
    const n=Number((await h.db`select count(*) n from fin_gl_entries`)[0].n);
    await user(`select fin_gl_sync('${h.ids.company}')`);
    expect(Number((await h.db`select count(*) n from fin_gl_entries`)[0].n)).toBe(n);
    const entries=await h.db`select e.source_kind,e.source_id,sum(l.debit) debit,sum(l.credit) credit from fin_gl_entries e join fin_gl_lines l on l.entry_id=e.id where e.company_id=${h.ids.company} group by e.id`;
    expect(entries.length).toBeGreaterThan(2);
    for(const e of entries)expect(Number(e.debit)).toBe(Number(e.credit));
    const inv=entries.filter(e=>e.source_kind==='invoice'&&e.source_id===id);
    expect(inv).toHaveLength(1);expect(Number(inv[0].debit)).toBe(229.95);
    const receipts=await h.db`select e.id,sum(l.debit) amount from fin_gl_entries e join fin_gl_lines l on l.entry_id=e.id join fin_invoice_receipts r on r.id=e.source_id where e.source_kind='receipt' and r.invoice_id=${id} group by e.id`;
    expect(receipts).toHaveLength(1);expect(Number(receipts[0].amount)).toBe(100);
    const credit=entries.filter(e=>e.source_kind==='credit_note'&&e.source_id===r.id);
    expect(credit).toHaveLength(1);expect(Number(credit[0].debit)).toBe(129.95);
    await expect(user(`update fin_gl_entries set description='Altération' where source_id='${id}' returning id`)).rejects.toThrow();
    expect(await h.asUser(h.ids.foreign,async tx=>tx`select id from fin_gl_entries where company_id=${h.ids.company}`)).toHaveLength(0);
  });
  it("facture l’acompte puis le solde via le dossier existant sans refacturer l’acompte", async () => {
    const q = await quote('S-TEST-02'); const { r } = await user(`select fin_progress_plan_create('${q}','plan-test') r`); const p = r.plan_id;
    const issue = async (kind: string,value: string,key: string) => {
      const { d } = await user(`select fin_progress_draft_save('${p}','${key}','${kind}','pct','${value}','2026-10-19','2026-11-19',null) d`);
      const sql = `select fin_progress_issue('${d.id}','issue-${key}',${d.rev},'${d.hash}') r`;
      const x = (await user(sql)).r; expect((await user(sql)).r.invoice_id).toBe(x.invoice_id); return x.invoice_id;
    };
    const first = await issue('acompte','30','deposit'); const last = await issue('solde','100','final');
    const invoices = await h.db`select subtotal,total from fin_invoices where id in (${first},${last})`;
    expect(invoices.map(i=>Number(i.subtotal)).sort((a,b)=>a-b)).toEqual([300,700]);
    expect(invoices.reduce((a,i)=>a+Number(i.total),0)).toBe(1149.76);
    await expect(user(`select fin_invoice_from_quote('${q}') r`)).rejects.toThrow(/progressive/);
  });
});