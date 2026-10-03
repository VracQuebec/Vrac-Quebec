// Carnets de coupons (lot 1) — préparation, expédition, pertes et renouvellements.
// L'envoi postal réel est fait par l'équipe ou un prestataire : ce module suit les étapes.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Database } from "@/integrations/supabase/types";

type Book = Database["public"]["Tables"]["cpn_books"]["Row"];
type Ev = Database["public"]["Tables"]["cpn_book_events"]["Row"];

const STATUS: Record<string, string> = {
  a_completer: "À compléter", a_preparer: "À préparer", pret: "Prêt à poster",
  expedie: "Expédié", livre: "Livré", perdu: "Perdu", annule: "Annulé",
};
const REASON: Record<string, string> = {
  inscription: "Inscription", renouvellement: "Renouvellement", remplacement: "Remplacement", manuel: "Manuel",
};
const FILTERS = ["tous", "a_completer", "a_preparer", "pret", "expedie", "livre", "perdu"] as const;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-CA") : "—");

type Mode = null | "adresse" | "expedie" | "perdu" | "annule" | "renouveler" | "remplacer";

export default function AdminCoupons() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("tous");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Book | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState({ note: "", carrier: "Postes Canada", tracking: "", address: "", city: "", postal: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cpn_books").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const openBook = async (b: Book) => {
    setOpen(b); setMode(null);
    setForm({ note: "", carrier: "Postes Canada", tracking: "", address: b.address ?? "", city: b.city ?? "", postal: b.postal_code ?? "" });
    const { data } = await supabase.from("cpn_book_events").select("*").eq("book_id", b.id).order("created_at");
    setEvents(data ?? []);
  };

  const act = async (action: string) => {
    if (!open || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("cpn_book_action", {
      _id: open.id, _action: action, _note: form.note || undefined, _carrier: form.carrier || undefined,
      _tracking: form.tracking || undefined, _address: form.address || undefined, _city: form.city || undefined, _postal: form.postal || undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success((data as { new_id?: string })?.new_id ? "Nouveau carnet préparé." : "Carnet mis à jour.");
    await load();
    const { data: fresh } = await supabase.from("cpn_books").select("*").eq("id", open.id).maybeSingle();
    if (fresh) void openBook(fresh); else setOpen(null);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const shown = rows.filter((r) =>
    (filter === "tous" || r.status === filter) &&
    (!q || [r.book_number, r.recipient_name, r.recipient_company, r.city, r.postal_code].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));

  if (!isReady || rl) return <div className="p-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Chargement…</div>;
  if (!isAdmin) return <div className="p-8 text-muted-foreground">Accès réservé à l'équipe Vrac Québec.</div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Carnets de coupons" subtitle="Préparation automatique à l'inscription; l'envoi postal est fait par l'équipe ou un prestataire." />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "tous" ? `Tous (${rows.length})` : `${STATUS[f]} (${counts[f] ?? 0})`}
            </Button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Numéro, nom, ville, code postal" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? <p className="text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Chargement…</p>
          : shown.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Aucun carnet. Ils se préparent automatiquement à chaque nouvelle dompe ou inscription d'entrepreneur.</p>
          : (
            <div className="grid gap-2">
              {shown.map((b) => (
                <Card key={b.id} className="cursor-pointer hover:border-primary" onClick={() => void openBook(b)}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold"><Ticket className="mr-1 inline h-4 w-4 text-primary" />{b.book_number} · {b.recipient_type === "client" ? "Client" : "Entrepreneur"}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.recipient_company || b.recipient_name || "Destinataire à compléter"} · {b.city ?? "—"} · coupons {b.first_coupon}–{b.last_coupon}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{REASON[b.reason]}</Badge>
                      <Badge variant={b.status === "a_completer" || b.status === "perdu" ? "destructive" : "secondary"}>{STATUS[b.status]}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </main>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto break-words">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.book_number} — {STATUS[open.status]}</DialogTitle></DialogHeader>
              <div className="space-y-1 text-sm">
                <p><b>{open.recipient_company || open.recipient_name || "Destinataire à compléter"}</b></p>
                <p>{open.address ?? "Adresse : À compléter"}{open.city ? `, ${open.city}` : ""} {open.postal_code ?? "(code postal à compléter)"}</p>
                <p className="text-muted-foreground">{open.coupon_count} coupons × {open.copies} exemplaires (client · chauffeur/entrepreneur · Vrac Québec), n° {open.first_coupon} à {open.last_coupon}</p>
                {open.tracking && <p>Suivi : {open.carrier} {open.tracking} · expédié le {fmt(open.shipped_at)}</p>}
                {open.note && <p className="text-muted-foreground">Note : {open.note}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/admin/coupons/${open.id}/imprimer`} target="_blank" rel="noreferrer"><Printer className="mr-1 h-4 w-4" />Feuilles à imprimer</a>
                </Button>
                {["a_completer", "a_preparer", "pret"].includes(open.status) && <Button size="sm" variant="outline" onClick={() => setMode("adresse")}>Adresse postale</Button>}
                {open.status === "a_preparer" && <Button size="sm" disabled={busy} onClick={() => void act("pret")}>Marquer prêt</Button>}
                {["a_preparer", "pret"].includes(open.status) && <Button size="sm" onClick={() => setMode("expedie")}>Expédié</Button>}
                {open.status === "expedie" && <Button size="sm" disabled={busy} onClick={() => void act("livre")}>Livré</Button>}
                {["expedie", "livre"].includes(open.status) && <Button size="sm" variant="destructive" onClick={() => setMode("perdu")}>Déclarer perdu</Button>}
                {open.status === "livre" && <Button size="sm" variant="outline" onClick={() => setMode("renouveler")}>Renouveler</Button>}
                {open.status === "perdu" && <Button size="sm" onClick={() => setMode("remplacer")}>Remplacer</Button>}
                {["a_completer", "a_preparer", "pret"].includes(open.status) && <Button size="sm" variant="ghost" onClick={() => setMode("annule")}>Annuler</Button>}
              </div>

              {mode && (
                <div className="space-y-2 rounded-md border p-3">
                  {mode === "adresse" && (<>
                    <Label>Adresse</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Ville</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                      <div><Label>Code postal</Label><Input value={form.postal} onChange={(e) => setForm({ ...form, postal: e.target.value })} /></div>
                    </div>
                  </>)}
                  {mode === "expedie" && (<>
                    <Label>Transporteur</Label><Input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} />
                    <Label>Numéro de suivi (facultatif)</Label><Input value={form.tracking} onChange={(e) => setForm({ ...form, tracking: e.target.value })} />
                  </>)}
                  <Label>{["perdu", "annule"].includes(mode) ? "Motif (obligatoire)" : "Note (facultatif)"}</Label>
                  <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void act(mode)}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirmer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Fermer</Button>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1 text-sm font-semibold">Historique</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {events.map((e) => (
                    <li key={e.id}>{new Date(e.created_at).toLocaleString("fr-CA")} — {e.action}{e.to_status ? ` → ${STATUS[e.to_status] ?? e.to_status}` : ""}{e.note ? ` (${e.note})` : ""}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
