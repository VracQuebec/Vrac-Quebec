// Vrac Québec OS — Console API publique (clés, portées, journal d'appels).
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Copy, Ban, Plus, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type ApiKey = {
  id: string; name: string; key_prefix: string | null; scopes: string[] | null;
  last_used_at: string | null; revoked_at: string | null; created_at: string; expires_at: string | null;
};
type ApiRequest = {
  id: string; method: string; path: string; status_code: number | null;
  duration_ms: number | null; created_at: string; error: string | null;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const generateKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `vq_live_${body}`;
};

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-v1`;

export default function ApiConsole({ companyId }: { companyId: string | null }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let keyQuery = supabase.from("jsc_api_keys").select("*").order("created_at", { ascending: false }).limit(50);
    let logQuery = supabase.from("jsc_api_requests").select("*").order("created_at", { ascending: false }).limit(60);
    if (companyId) { keyQuery = keyQuery.eq("company_id", companyId); logQuery = logQuery.eq("company_id", companyId); }
    const [k, l] = await Promise.all([keyQuery, logQuery]);
    if (k.error) toast.error(k.error.message);
    setKeys((k.data ?? []) as ApiKey[]);
    setLogs((l.data ?? []) as ApiRequest[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const toggleScope = (scope: string) =>
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const createKey = async () => {
    if (name.trim().length < 2) { toast.error("Donnez un nom à la clé."); return; }
    if (scopes.length === 0) { toast.error("Choisissez au moins une portée."); return; }
    setCreating(true);
    const raw = generateKey();
    const { error } = await supabase.from("jsc_api_keys").insert({
      company_id: companyId,
      name: name.trim(),
      key_prefix: raw.slice(0, 16),
      key_hash: await sha256(raw),
      scopes,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setRevealed(raw);
    setName("");
    toast.success("Clé créée — copiez-la maintenant, elle ne sera plus affichée.");
    void load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("jsc_api_keys")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Clé révoquée.");
    void load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">API publique</h2>
        <p className="text-sm text-muted-foreground">
          Permet à un système externe (ERP client, site web, automatisation) de créer des demandes et de
          consulter soumissions, livraisons et factures. Chaque clé est cloisonnée à une entreprise.
        </p>
      </div>

      {revealed && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="mb-2 text-sm font-medium">Votre nouvelle clé (affichée une seule fois)</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-xs">{revealed}</code>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(revealed); toast.success("Copiée"); }}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>Masquer</Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Nouvelle clé</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="api-key-name">Nom</Label>
            <Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Intégration site web" />
          </div>
          <div className="flex items-center gap-2">
            {["read", "write"].map((scope) => (
              <Button key={scope} type="button" size="sm"
                variant={scopes.includes(scope) ? "default" : "outline"}
                onClick={() => toggleScope(scope)}>
                {scope === "read" ? "Lecture" : "Écriture"}
              </Button>
            ))}
          </div>
          <Button onClick={() => void createKey()} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Générer la clé
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> Documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Point d'entrée : <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{API_URL}</code></p>
          <p>Authentification : en-tête <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-Api-Key</code>.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><code>GET /docs</code> — documentation complète</li>
            <li><code>POST /requests</code> — créer une demande (écriture)</li>
            <li><code>GET /quotes</code> — soumissions (lecture)</li>
            <li><code>POST /orders</code> — convertir une soumission en commande (écriture)</li>
            <li><code>GET /deliveries</code> — suivi des livraisons (lecture)</li>
            <li><code>GET /invoices</code> — factures (lecture)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Clés actives</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Chargement…</p>}
          {!loading && keys.length === 0 && <p className="text-sm text-muted-foreground">Aucune clé pour cette entreprise.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  {k.key_prefix}…  ·  {(k.scopes ?? []).join(", ") || "aucune portée"}  ·{" "}
                  {k.last_used_at ? `dernier appel ${new Date(k.last_used_at).toLocaleString("fr-CA")}` : "jamais utilisée"}
                </p>
              </div>
              {k.revoked_at
                ? <Badge variant="secondary">Révoquée</Badge>
                : <Button size="sm" variant="outline" onClick={() => void revoke(k.id)}><Ban className="mr-1.5 h-3.5 w-3.5" /> Révoquer</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Derniers appels</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {logs.length === 0 && <p className="text-sm text-muted-foreground">Aucun appel enregistré.</p>}
          {logs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-xs last:border-0">
              <span className="font-mono">{r.method} {r.path}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Badge variant={(r.status_code ?? 500) < 400 ? "default" : "destructive"}>{r.status_code}</Badge>
                {r.duration_ms ?? 0} ms · {new Date(r.created_at).toLocaleString("fr-CA")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
