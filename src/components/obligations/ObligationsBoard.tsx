// Obligations et renouvellements : écritures par RPC obl_* seulement, lecture sous RLS.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { daysLeft, linkFor, oblStatus, STATUS_UI, torontoToday } from "@/lib/obligations/status";

const db = supabase as any;
type Item = any;
const PAY_KINDS = ["req_droits", "rpevl_frais", "rcv_droits"];
const SRC: Record<string, string> = { avis: "Avis", dossier: "Dossier officiel", attestation: "Attestation CTQ", previsionnelle: "Prévisionnelle (à confirmer)" };
const ACTION: Record<string, string> = { creation: "Création", modification: "Modification", realisation_declaree: "Réalisation déclarée", paiement_declare: "Paiement déclaré", reouverture: "Réouverture", desactivation: "Suivi désactivé", note: "Note", justificatif: "Justificatif ajouté", rappel_reporte: "Rappel reporté", identifiants: "Identifiants modifiés" };

export default function ObligationsBoard({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const today = torontoToday();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [items, setItems] = useState<Item[] | null>(null);
  const [ids, setIds] = useState({ neq: "", nir: "", rcv: "", form: "" });
  const [company, setCompany] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: it, error }, { data: idr }, { data: c }, { data: m }] = await Promise.all([
      db.from("obl_items").select("*").eq("company_id", companyId).eq("period_year", year).order("kind"),
      db.from("obl_company_ids").select("*").eq("company_id", companyId).maybeSingle(),
      db.from("jsc_companies").select("name,legal_name,address,phone,email").eq("id", companyId).maybeSingle(),
      db.from("jsc_company_members").select("user_id,full_name,email").eq("company_id", companyId).eq("is_active", true).is("archived_at", null),
    ]);
    if (error) { setErr(error.message); return; }
    setErr(null); setItems(it ?? []); setCompany(c); setMembers((m ?? []).filter((x: any) => x.user_id));
    if (idr) setIds({ neq: idr.neq ?? "", nir: idr.nir ?? "", rcv: idr.rcv_ref ?? "", form: idr.legal_form ?? "" });
  }, [companyId, year]);
  useEffect(() => { load(); }, [load]);

  const rpc = async (fn: string, args: any, ok: string) => {
    if (busy) return false; setBusy(true);
    const { error } = await db.rpc(fn, args);
    setBusy(false);
    if (error) { toast({ title: "Refusé", description: error.message, variant: "destructive" }); return false; }
    toast({ title: ok }); await load(); return true;
  };

  const counts = useMemo(() => {
    const s = (items ?? []).map((i) => oblStatus(i, today));
    return { conf: s.filter((x) => x === "a_confirmer").length, soon: s.filter((x) => x === "proche").length, late: s.filter((x) => x === "depassee").length };
  }, [items, today]);
  const name = (u: string | null) => members.find((m) => m.user_id === u)?.full_name || members.find((m) => m.user_id === u)?.email || "—";

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-md border border-border p-3">
        <h2 className="font-semibold">Identification de l'entreprise</h2>
        <p className="text-sm">Nom légal : <strong>{company?.legal_name || company?.name || "—"}</strong>{company?.address ? ` · ${company.address}` : ""}{company?.phone ? ` · ${company.phone}` : ""}</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs">NEQ (10 chiffres)<Input inputMode="numeric" value={ids.neq} disabled={!canWrite} onChange={(e) => setIds({ ...ids, neq: e.target.value })} /></label>
          <label className="text-xs">Forme juridique<Input value={ids.form} disabled={!canWrite} onChange={(e) => setIds({ ...ids, form: e.target.value })} placeholder="Société par actions…" /></label>
          <label className="text-xs">NIR (CTQ)<Input value={ids.nir} disabled={!canWrite} onChange={(e) => setIds({ ...ids, nir: e.target.value })} /></label>
          <label className="text-xs">Inscription au RCV<Input value={ids.rcv} disabled={!canWrite} onChange={(e) => setIds({ ...ids, rcv: e.target.value })} placeholder="Si inscrite" /></label>
        </div>
        {canWrite && <Button size="sm" variant="outline" disabled={busy} onClick={() => rpc("obl_ids_save", { _company: companyId, _neq: ids.neq, _nir: ids.nir, _rcv: ids.rcv, _form: ids.form }, "Identifiants enregistrés")}>Enregistrer</Button>}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Année visée<Input className="w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
          {canWrite && <Button size="sm" disabled={busy} onClick={() => rpc("obl_seed", { _company: companyId, _year: year }, "Obligations de l'année préparées")}>Préparer {year}</Button>}
          {canWrite && <Button size="sm" variant="outline" disabled={busy || !items?.length} onClick={async () => { if (await rpc("obl_renew", { _company: companyId, _from_year: year }, `Période ${year + 1} préparée (échéances prévisionnelles à confirmer)`)) setYear(year + 1); }}>Préparer {year + 1}</Button>}
          {canWrite && <AddOther companyId={companyId} year={year} onDone={load} />}
        </div>
        <p className="text-xs text-muted-foreground">{counts.conf} à confirmer · {counts.soon} à faire prochainement · {counts.late} en retard. Les confirmations sont déclarées par l'entreprise : aucune vérification automatique auprès du gouvernement.</p>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {items && !items.length && <p className="text-sm text-muted-foreground">Aucune obligation pour {year}. {canWrite ? `Appuyez sur « Préparer ${year} ».` : ""}</p>}
        <ul className="space-y-2">
          {items?.map((i) => {
            const st = oblStatus(i, today); const d = daysLeft(i.due_date, today);
            return (
              <li key={i.id}>
                <button className="w-full rounded-md border border-border p-3 text-left hover:bg-muted/50" onClick={() => setOpen(i)}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-muted-foreground">{i.authority} · {i.period_year} · Responsable : {name(i.responsible_user)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_UI[st].cls}`}>{STATUS_UI[st].label}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {i.applicability === "a_confirmer" ? "Applicabilité à confirmer" : i.applicability === "non_applicable" ? "Non applicable" : i.due_date ? `Date limite ${i.due_date}${i.due_confirmed ? "" : " (à confirmer)"}${i.status === "ouvert" && d !== null ? ` · ${d >= 0 ? `${d} jour(s) restant(s)` : `dépassée de ${-d} jour(s)`}` : ""}` : "Échéance à confirmer — complétez le dossier"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {open && <Detail item={open} members={members} canWrite={canWrite} onClose={() => setOpen(null)} onChanged={async () => { await load(); setOpen(null); }} rpc={rpc} busy={busy} />}
    </div>
  );
}

function AddOther({ companyId, year, onDone }: { companyId: string; year: number; onDone: () => void }) {
  const [o, setO] = useState(false); const [f, setF] = useState({ authority: "", title: "", description: "" }); const [b, setB] = useState(false);
  return (<>
    <Button size="sm" variant="outline" onClick={() => setO(true)}>Autre droit ou cotisation de transport</Button>
    <Dialog open={o} onOpenChange={setO}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Autre droit ou cotisation de transport</DialogTitle></DialogHeader>
      <Input placeholder="Organisme" value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })} />
      <Input placeholder="Description" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <Input placeholder="Détails (facultatif)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <Button disabled={b || !f.authority.trim() || !f.title.trim()} onClick={async () => {
        setB(true); const { error } = await db.rpc("obl_item_save", { _id: null, _company: companyId, _f: { ...f, period_year: year }, _rev: null }); setB(false);
        if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
        setO(false); setF({ authority: "", title: "", description: "" }); onDone();
      }}>Ajouter (échéance à saisir ensuite)</Button>
    </DialogContent></Dialog>
  </>);
}

function Detail({ item, members, canWrite, onClose, onChanged, rpc, busy }: any) {
  const [f, setF] = useState({
    applicability: item.applicability, due_date: item.due_date ?? "", due_source: item.due_source ?? "", due_confirmed: item.due_confirmed,
    amount: item.amount ?? "", responsible_user: item.responsible_user ?? "", combined_with_tax: item.combined_with_tax,
  });
  const [done, setDone] = useState({ done_on: "", paid_on: "" });
  const [note, setNote] = useState(""); const [reason, setReason] = useState(""); const [until, setUntil] = useState("");
  const [hist, setHist] = useState<any[]>([]); const [sib, setSib] = useState<any[]>([]); const [bills, setBills] = useState<any[]>([]);
  const isPay = PAY_KINDS.includes(item.kind); const link = linkFor(item.kind);
  useEffect(() => {
    db.from("obl_events").select("*").eq("item_id", item.id).order("at", { ascending: false }).then(({ data }: any) => setHist(data ?? []));
    if (["rpevl_frais", "rcv_droits"].includes(item.kind))
      db.from("obl_items").select("id,kind,joint_group,rev,status").eq("company_id", item.company_id).eq("period_year", item.period_year).in("kind", ["rpevl_frais", "rcv_droits"]).neq("id", item.id).then(({ data }: any) => setSib(data ?? []));
    if (isPay) db.from("fin_supplier_bills").select("id,bill_number,total,bill_date").eq("company_id", item.company_id).order("bill_date", { ascending: false }).limit(30).then(({ data }: any) => setBills(data ?? []));
  }, [item, isPay]);

  const save = () => rpc("obl_item_save", { _id: item.id, _company: null, _rev: item.rev, _f: {
    applicability: f.applicability, due_date: f.due_date, due_source: f.due_source, due_confirmed: !!f.due_confirmed && !!f.due_source && f.due_source !== "previsionnelle",
    amount: f.amount === "" ? "" : String(f.amount).replace(",", "."), responsible_user: f.responsible_user, ...(item.kind === "req_declaration" ? { combined_with_tax: !!f.combined_with_tax } : {}),
  } }, "Obligation enregistrée").then((ok: boolean) => ok && onChanged());

  const upload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast({ title: "Fichier trop lourd (10 Mo max)", variant: "destructive" });
    const path = `${item.company_id}/${item.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("obl-proofs").upload(path, file, { upsert: false });
    if (error) return toast({ title: "Envoi refusé", description: error.message, variant: "destructive" });
    if (await rpc("obl_item_action", { _id: item.id, _action: "justificatif", _p: { path, name: file.name } }, "Justificatif ajouté")) onChanged();
  };
  const view = async (path: string) => {
    const { data, error } = await supabase.storage.from("obl-proofs").createSignedUrl(path, 120);
    if (error) return toast({ title: "Accès refusé", description: error.message, variant: "destructive" });
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle className="pr-6 text-base">{item.title} — {item.period_year}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{item.authority}{item.description ? ` · ${item.description}` : ""}</p>
        {link && <a className="text-sm text-primary underline" href={link.url} target="_blank" rel="noopener noreferrer">Consulter la démarche officielle : {link.label}</a>}

        <fieldset disabled={!canWrite || busy} className="space-y-2">
          <label className="block text-xs">Applicabilité
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.applicability} onChange={(e) => setF({ ...f, applicability: e.target.value })}>
              <option value="a_confirmer">À confirmer</option><option value="applicable">Applicable</option><option value="non_applicable">Non applicable</option>
            </select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">{isPay ? "Échéance de paiement" : "Échéance de déclaration"}<Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
            <label className="text-xs">Source de la date
              <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.due_source} onChange={(e) => setF({ ...f, due_source: e.target.value })}>
                <option value="">—</option>{Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.due_confirmed} onChange={(e) => setF({ ...f, due_confirmed: e.target.checked })} />Je confirme cette date d'après le dossier officiel ou l'avis</label>
          {isPay && <label className="block text-xs">Montant indiqué sur l'avis ($)<Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>}
          {item.kind === "req_declaration" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.combined_with_tax} onChange={(e) => setF({ ...f, combined_with_tax: e.target.checked })} />Déclaration jumelée à la déclaration de revenus</label>}
          <label className="block text-xs">Responsable du suivi
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.responsible_user} onChange={(e) => setF({ ...f, responsible_user: e.target.value })}>
              <option value="">Propriétaires et gestionnaires</option>{members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
            </select></label>
          {canWrite && <Button size="sm" onClick={save}>Enregistrer</Button>}
        </fieldset>

        {sib.length > 0 && canWrite && (
          <div className="rounded-md border border-border p-2 text-xs">
            Les droits du RCV sont payables lors de la mise à jour au RPEVL.
            {item.joint_group ? " Échéance et justificatif communs activés." : (
              <Button size="sm" variant="outline" className="ml-2" onClick={async () => {
                const g = crypto.randomUUID();
                const s = sib[0];
                const a = await db.rpc("obl_item_save", { _id: item.id, _company: null, _rev: item.rev, _f: { joint_group: g } });
                const b = await db.rpc("obl_item_save", { _id: s.id, _company: null, _rev: s.rev, _f: { joint_group: g } });
                if (a.error || b.error) toast({ title: "Refusé", description: (a.error || b.error).message, variant: "destructive" }); else { toast({ title: "Échéance commune activée" }); onChanged(); }
              }}>Utiliser une échéance commune</Button>)}
          </div>
        )}

        {item.kind === "vq_profil" ? (
          <div className="space-y-1 rounded-md border border-border p-2">
            <Link className="text-sm text-primary underline" to="/entrepreneur/compte">Vérifier et mettre à jour mon profil Vrac Québec</Link>
            <p className="text-xs text-muted-foreground">La modification du profil Vrac Québec ne constitue pas une déclaration gouvernementale.</p>
            {item.profile_checked_at && <p className="text-xs">Profil vérifié le {new Date(item.profile_checked_at).toLocaleDateString("fr-CA", { timeZone: "America/Toronto" })}</p>}
            {canWrite && item.status === "ouvert" && <Button size="sm" disabled={busy} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "completer", _p: {} }, "Vérification du profil enregistrée").then((ok: boolean) => ok && onChanged())}>J'ai vérifié mon profil</Button>}
          </div>
        ) : canWrite && item.status === "ouvert" && item.applicability !== "non_applicable" && (
          <div className="space-y-2 rounded-md border border-border p-2">
            <p className="text-sm font-medium">{isPay ? "Confirmer les droits payés" : "Confirmer la déclaration effectuée"}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">{isPay ? "Date du paiement déclarée" : "Date de la déclaration"}<Input type="date" max={torontoToday()} value={done.done_on} onChange={(e) => setDone({ ...done, done_on: e.target.value })} /></label>
              {isPay && <label className="text-xs">Date de paiement (si différente)<Input type="date" max={torontoToday()} value={done.paid_on} onChange={(e) => setDone({ ...done, paid_on: e.target.value })} /></label>}
            </div>
            <Button size="sm" disabled={busy || !done.done_on} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "completer", _p: { done_on: done.done_on, paid_on: isPay ? (done.paid_on || done.done_on) : null } }, "Réalisation déclarée — relances arrêtées").then((ok: boolean) => ok && onChanged())}>Confirmer</Button>
            <p className="text-xs text-muted-foreground">Déclaration de l'entreprise, non vérifiée auprès du gouvernement.</p>
          </div>
        )}
        {item.status === "realise" && <p className="text-sm">Réalisation déclarée le {item.done_on}{item.paid_on ? ` · payé le ${item.paid_on}` : ""}.</p>}

        <div className="space-y-1">
          <p className="text-sm font-medium">Justificatifs</p>
          {item.proofs?.length ? item.proofs.map((p: any) => <button key={p.path} className="block text-left text-sm text-primary underline" onClick={() => view(p.path)}>{p.name}</button>) : <p className="text-xs text-muted-foreground">Aucun.</p>}
          {canWrite && <input type="file" accept="application/pdf,image/*" aria-label="Ajouter un reçu ou une confirmation" className="text-sm" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />}
          {isPay && canWrite && bills.length > 0 && (
            <label className="block text-xs">Justificatif déjà enregistré dans Finances (aucune nouvelle dépense créée)
              <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={item.fin_ref?.id ?? ""} onChange={(e) => {
                const b = bills.find((x) => x.id === e.target.value);
                rpc("obl_item_save", { _id: item.id, _company: null, _rev: item.rev, _f: { fin_ref: b ? { table: "fin_supplier_bills", id: b.id, label: `${b.bill_number ?? "Facture"} · ${b.bill_date ?? ""}` } : null } }, "Lien Finances enregistré").then((ok: boolean) => ok && onChanged());
              }}>
                <option value="">—</option>{bills.map((b) => <option key={b.id} value={b.id}>{b.bill_number ?? "Facture"} · {b.bill_date} · {b.total} $</option>)}
              </select></label>
          )}
        </div>

        {canWrite && (
          <div className="space-y-2">
            <div className="flex gap-2"><Input placeholder="Ajouter une note" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "note", _p: { text: note } }, "Note ajoutée").then((ok: boolean) => ok && onChanged())}>Ajouter</Button></div>
            {item.status === "ouvert" && <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Reporter les rappels jusqu'au<Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
              <Button size="sm" variant="outline" disabled={busy || !until} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "reporter_rappel", _p: { until } }, "Rappels reportés — l'échéance officielle ne change pas").then((ok: boolean) => ok && onChanged())}>Reporter</Button></div>}
            <div className="flex flex-wrap gap-2"><Input placeholder="Motif (réouverture ou désactivation)" value={reason} onChange={(e) => setReason(e.target.value)} />
              {item.status !== "ouvert" && <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "rouvrir", _p: { reason } }, "Obligation rouverte").then((ok: boolean) => ok && onChanged())}>Rouvrir</Button>}
              {item.status === "ouvert" && <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => rpc("obl_item_action", { _id: item.id, _action: "desactiver", _p: { reason } }, "Suivi désactivé").then((ok: boolean) => ok && onChanged())}>Désactiver le suivi</Button>}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium">Historique</p>
          <ul className="space-y-0.5 text-xs">{hist.map((h) => <li key={h.id}>{new Date(h.at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {ACTION[h.action] ?? h.action} · {members.find((m: any) => m.user_id === h.actor)?.full_name || (h.actor ? "Utilisateur" : "Système")}{h.detail?.text ? ` — ${h.detail.text}` : h.detail?.reason ? ` — ${h.detail.reason}` : ""}</li>)}</ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
