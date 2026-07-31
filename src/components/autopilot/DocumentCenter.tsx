// Gestion documentaire — centralisation des contrats, factures, bons de livraison et photos.
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Doc = {
  id: string; title: string; doc_type: string; entity_type: string; entity_id: string;
  external_url: string | null; notes: string | null; created_at: string;
};

const TYPES = ["contrat", "soumission", "facture", "bon_livraison", "photo", "preuve_livraison", "autre"];
const ENTITIES = ["client", "request", "quote", "order", "delivery", "invoice", "truck", "driver"];

export default function DocumentCenter({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({ title: "", doc_type: "contrat", entity_type: "client", entity_id: "", external_url: "" });

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_documents").select("*").is("archived_at", null)
      .order("created_at", { ascending: false }).limit(200);
    if (companyId) q = q.eq("company_id", companyId);
    if (filter !== "all") q = q.eq("doc_type", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as unknown as Doc[]) ?? []);
    setLoading(false);
  }, [companyId, filter]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!form.title.trim() || !form.entity_id.trim()) {
      toast.error("Titre et dossier lié obligatoires");
      return;
    }
    const { error } = await supabase.from("jsc_documents").insert({
      company_id: companyId, title: form.title.trim(), doc_type: form.doc_type,
      entity_type: form.entity_type, entity_id: form.entity_id.trim(),
      external_url: form.external_url.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Document enregistré");
    setForm({ ...form, title: "", entity_id: "", external_url: "" });
    await load();
  };

  const archive = async (d: Doc) => {
    const { error } = await supabase.from("jsc_documents")
      .update({ archived_at: new Date().toISOString() }).eq("id", d.id);
    if (error) toast.error(error.message); else await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-2 p-4 md:grid-cols-6">
          <Input className="md:col-span-2" placeholder="Titre du document"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ENTITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Identifiant du dossier"
            value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="Lien (optionnel)"
              value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} />
            <Button onClick={() => void add()}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      {loading && !rows.length && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {!loading && !rows.length && <p className="py-10 text-center text-sm text-muted-foreground">Aucun document.</p>}

      <div className="space-y-2">
        {rows.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.entity_type} · {new Date(d.created_at).toLocaleDateString("fr-CA")}
                  </p>
                </div>
                <Badge variant="outline">{d.doc_type}</Badge>
              </div>
              <div className="flex gap-2">
                {d.external_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={d.external_url} target="_blank" rel="noreferrer">Ouvrir</a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void archive(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
