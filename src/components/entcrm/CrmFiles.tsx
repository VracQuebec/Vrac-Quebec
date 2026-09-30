// Pièces privées d'un dossier CRM (lead, client, soumission, chantier).
// Un fichier = un objet stocké, relié à plusieurs dossiers sans copie.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Paperclip, FileText, Download, Link2Off, Trash2, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FILE_ACCEPT, FILE_CATEGORIES, FILE_MAX, FILE_MIME } from "@/lib/entcrm/catalog";

const db = supabase as any;
const BUCKET = "entcrm-files";
type Up = { key: string; file: File; status: "pending" | "uploading" | "error" | "done"; error?: string };

export default function CrmFiles({ companyId, ownerType, ownerId, canWrite, canAdmin, showClientToggle }: {
  companyId: string; ownerType: "lead" | "client" | "quote" | "project"; ownerId: string; canWrite: boolean; canAdmin: boolean; showClientToggle?: boolean;
}) {
  const [links, setLinks] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Recherche, filtres et fichiers non envoyés : gardés par dossier sur cet appareil (Retour, actualisation).
  // Un fichier local ne survit jamais à une actualisation : seul son nom est gardé, marqué « à joindre de nouveau ».
  const sk = `vq.crmFiles.${companyId}.${ownerType}.${ownerId}`;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(sk) || "{}"); } catch { return {}; } })();
  const [q, setQ] = useState<string>(saved.q ?? ""); const [cat, setCat] = useState<string>(saved.cat ?? ""); const [newCat, setNewCat] = useState<string>(saved.newCat ?? "autre");
  const [showArchived, setShowArchived] = useState<boolean>(!!saved.arch);
  const [ups, setUps] = useState<Up[]>([]);
  const lk = `vq.crmFilesPending.${companyId}.${ownerType}.${ownerId}`;
  const [lost, setLost] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(lk) || "[]"); } catch { return []; } });
  useEffect(() => { try { sessionStorage.setItem(sk, JSON.stringify({ q, cat, newCat, arch: showArchived })); } catch { /* stockage indisponible */ } }, [sk, q, cat, newCat, showArchived]);
  useEffect(() => { const names = ups.map((u) => u.file.name); try { names.length ? localStorage.setItem(lk, JSON.stringify(names)) : lost.length || localStorage.removeItem(lk); } catch { /* ignore */ } }, [ups]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ups.some((u) => u.status !== "done")) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [ups]);
  const forgetLost = (n?: string) => { const next = n ? lost.filter((x) => x !== n) : []; setLost(next); try { next.length ? localStorage.setItem(lk, JSON.stringify(next)) : localStorage.removeItem(lk); } catch { /* ignore */ } };
  const cam = useRef<HTMLInputElement>(null); const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await db.from("ent_crm_file_links").select("id, client_visible, file:ent_crm_files(*)")
      .eq("company_id", companyId).eq("owner_type", ownerType).eq("owner_id", ownerId).order("created_at", { ascending: false });
    const list = (data ?? []).filter((l: any) => l.file);
    setLinks(list);
    const imgs = list.filter((l: any) => l.file.mime_type.startsWith("image/"));
    if (imgs.length) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(imgs.map((l: any) => l.file.storage_path), 600);
      const m: Record<string, string> = {}; imgs.forEach((l: any, i: number) => { if (s?.[i]?.signedUrl) m[l.file.id] = s[i].signedUrl; }); setUrls(m);
    }
  }, [companyId, ownerType, ownerId]);
  useEffect(() => { void load(); }, [load]);

  const validate = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_MIME[ext]) return "Format non accepté (JPG, PNG, WEBP, HEIC ou PDF).";
    if (f.size > FILE_MAX) return "Fichier trop lourd (20 Mo au maximum).";
    if (!f.size) return "Fichier vide.";
    return null;
  };

  const uploadOne = async (u: Up) => {
    setUps((l) => l.map((x) => x.key === u.key ? { ...x, status: "uploading", error: undefined } : x));
    const err = validate(u.file);
    const fail = (e: string) => setUps((l) => l.map((x) => x.key === u.key ? { ...x, status: "error", error: e } : x));
    if (err) return fail(err);
    const ext = u.file.name.split(".").pop()!.toLowerCase();
    const path = `company/${companyId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, u.file, { contentType: FILE_MIME[ext], upsert: false });
    if (up.error) return fail(`Envoi refusé : ${up.error.message}`);
    // La fiche n'est créée qu'après la confirmation de l'envoi.
    const { data: f, error } = await db.from("ent_crm_files").insert({ company_id: companyId, storage_path: path, file_name: u.file.name, mime_type: FILE_MIME[ext], size_bytes: u.file.size, title: u.file.name.replace(/\.[^.]+$/, ""), category: newCat, is_field: ownerType === "project" && ["avant_travaux", "apres_travaux", "bon_livraison", "billet_pesee"].includes(newCat) }).select("id").single();
    if (error) { await supabase.storage.from(BUCKET).remove([path]); return fail(`Enregistrement refusé : ${error.message}`); }
    const l = await db.from("ent_crm_file_links").insert({ company_id: companyId, file_id: f.id, owner_type: ownerType, owner_id: ownerId });
    if (l.error) return fail(`Rattachement refusé : ${l.error.message}`);
    setUps((l2) => l2.filter((x) => x.key !== u.key));
    if (lost.includes(u.file.name)) forgetLost(u.file.name);
  };

  const add = async (list?: FileList | null) => {
    if (!list?.length) return;
    const items: Up[] = Array.from(list).map((file) => ({ key: crypto.randomUUID(), file, status: "pending" }));
    setUps((l) => [...l, ...items]);
    for (const it of items) await uploadOne(it);
    if (cam.current) cam.current.value = ""; if (pick.current) pick.current.value = "";
    load();
  };

  const signed = async (l: any, download = false) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(l.file.storage_path, 300, download ? { download: l.file.file_name } : undefined);
    if (error || !data) return toast({ title: "Accès refusé", description: error?.message, variant: "destructive" });
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const patchFile = async (l: any, patch: any) => { const { error } = await db.from("ent_crm_files").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", l.file.id); if (error) toast({ title: "Refusé", description: error.message }); load(); };
  const unlink = async (l: any) => { if (!confirm("Retirer cette pièce de ce dossier ? Le fichier reste disponible dans les autres dossiers.")) return; const { error } = await db.from("ent_crm_file_links").delete().eq("id", l.id); if (error) toast({ title: "Refusé", description: error.message }); load(); };
  const destroy = async (l: any) => {
    const { count } = await db.from("ent_crm_file_links").select("id", { count: "exact", head: true }).eq("file_id", l.file.id);
    if (!confirm(`Supprimer définitivement « ${l.file.title ?? l.file.file_name} » ? Il est relié à ${count ?? 1} dossier(s) et disparaîtra partout.`)) return;
    const { error } = await db.from("ent_crm_files").delete().eq("id", l.file.id);
    if (error) return toast({ title: "Refusé", description: error.message });
    await supabase.storage.from(BUCKET).remove([l.file.storage_path]); load();
  };

  const shown = links.filter((l) => (showArchived ? !!l.file.archived_at : !l.file.archived_at) && (!cat || l.file.category === cat)
    && (!q || `${l.file.title} ${l.file.file_name} ${l.file.description ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return <div className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-sm font-semibold">Photos et documents</span>
      {canWrite && <>
        <select aria-label="Catégorie des nouveaux fichiers" className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={newCat} onChange={(e) => setNewCat(e.target.value)}>{FILE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
        <Button size="sm" variant="outline" onClick={() => cam.current?.click()}><Camera className="mr-1 h-4 w-4" />Photo</Button>
        <Button size="sm" variant="outline" onClick={() => pick.current?.click()}><Paperclip className="mr-1 h-4 w-4" />Joindre</Button>
        <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => add(e.target.files)} />
        <input ref={pick} type="file" hidden multiple accept={FILE_ACCEPT} onChange={(e) => add(e.target.files)} />
      </>}
    </div>
    <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC ou PDF · 20 Mo au maximum par fichier · accès privé par lien temporaire.</p>
    {lost.filter((n) => !ups.some((u) => u.file.name === n)).length > 0 && <div role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
      <p className="font-semibold">Non envoyé — à joindre de nouveau :</p>
      {lost.filter((n) => !ups.some((u) => u.file.name === n)).map((n) => <p key={n} className="flex items-center gap-2"><span className="flex-1 truncate">{n}</span><Button size="sm" variant="ghost" onClick={() => forgetLost(n)}>Ignorer</Button></p>)}
      <p className="text-muted-foreground">Ces fichiers n'ont pas été enregistrés. Utilisez « Joindre » pour les sélectionner de nouveau.</p></div>}
    {ups.map((u) => <div key={u.key} className="flex items-center gap-2 text-xs">
      <span className="flex-1 truncate">{u.file.name}</span>
      {u.status === "uploading" || u.status === "pending" ? <span className="text-muted-foreground">Envoi en cours…</span>
        : <><span className="text-destructive">{u.error}</span><Button size="sm" variant="outline" onClick={() => uploadOne(u).then(load)}>Réessayer</Button><Button size="sm" variant="ghost" onClick={() => setUps((l) => l.filter((x) => x.key !== u.key))}>Retirer</Button></>}
    </div>)}
    <div className="flex flex-wrap gap-2">
      <Input className="h-9 w-full sm:w-48" placeholder="Rechercher par nom" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Filtrer par catégorie" className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{FILE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Archivés</label>
    </div>
    {!shown.length && <p className="text-xs text-muted-foreground">Aucune pièce.</p>}
    <div className="grid gap-2 sm:grid-cols-2">{shown.map((l) => <div key={l.id} className="flex gap-2 rounded-md border border-border p-2">
      {urls[l.file.id] ? <button onClick={() => signed(l)}><img src={urls[l.file.id]} alt={l.file.title ?? "Photo"} className="h-16 w-16 rounded object-cover" /></button>
        : <button onClick={() => signed(l)} className="flex h-16 w-16 items-center justify-center rounded bg-muted"><FileText className="h-6 w-6 text-muted-foreground" /></button>}
      <div className="min-w-0 flex-1 text-xs">
        {canWrite ? <Input className="h-8 text-xs" defaultValue={l.file.title ?? ""} onBlur={(e) => e.target.value !== (l.file.title ?? "") && patchFile(l, { title: e.target.value || null })} aria-label="Titre" />
          : <p className="truncate font-semibold">{l.file.title ?? l.file.file_name}</p>}
        {canWrite ? <Input className="mt-1 h-8 text-xs" placeholder="Description" defaultValue={l.file.description ?? ""} onBlur={(e) => e.target.value !== (l.file.description ?? "") && patchFile(l, { description: e.target.value || null })} aria-label="Description" />
          : l.file.description && <p className="text-muted-foreground">{l.file.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {canWrite ? <select aria-label="Catégorie" className="h-7 rounded border border-border bg-background text-xs" value={l.file.category} onChange={(e) => patchFile(l, { category: e.target.value })}>{FILE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
            : <span>{FILE_CATEGORIES.find((c) => c.v === l.file.category)?.l}</span>}
          {showClientToggle && canWrite && <label className="flex items-center gap-1"><input type="checkbox" checked={l.client_visible} onChange={async (e) => { await db.from("ent_crm_file_links").update({ client_visible: e.target.checked }).eq("id", l.id); load(); }} />Pour le client</label>}
          <button aria-label="Télécharger" onClick={() => signed(l, true)} className="p-1"><Download className="h-3.5 w-3.5" /></button>
          {canWrite && <button aria-label={l.file.archived_at ? "Désarchiver" : "Archiver"} onClick={() => patchFile(l, { archived_at: l.file.archived_at ? null : new Date().toISOString() })} className="p-1">{l.file.archived_at ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>}
          {canWrite && <button aria-label="Retirer du dossier" onClick={() => unlink(l)} className="p-1"><Link2Off className="h-3.5 w-3.5" /></button>}
          {canAdmin && <button aria-label="Supprimer le fichier" onClick={() => destroy(l)} className="p-1 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
    </div>)}</div>
  </div>;
}
