// Import / export CSV des tarifs matériaux, avec aperçu, validation et rapport d'erreurs.
// Règles : identifiants retrouvés (price_id, sinon slug + code de variante) ;
// un prix existant n'est jamais écrasé sans « remplacer = oui » ; vide ≠ 0 $.
import { useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Cat, JscMat, Price, Variant } from "@/components/jsc/MaterialPricing";

const COLS = ["price_id", "material_slug", "variant_code", "price_kind", "unit", "selling_price", "purchase_price",
  "minimum_quantity", "max_quantity", "zone_label", "valid_from", "valid_to", "transport_included", "auto_quote_enabled", "priority", "zero_price_confirmed", "remplacer"] as const;
const UNITS = ["tonne", "m3", "verge", "voyage", "forfait"];
const KINDS = ["vente", "transport", "reception"];

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === "," || ch === ";") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const yes = (v: string) => ["oui", "true", "1", "yes"].includes(v.trim().toLowerCase());
const numOrNull = (v: string): number | null | "err" => { const t = v.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : "err"; };

type Planned = { line: number; action: "update" | "create" | "skip"; label: string; payload: Record<string, unknown>; priceId?: string; slug?: string; variantCode?: string; note?: string };

export default function PricingCsv({ cats, vars, mats, prices, onDone }: { cats: Cat[]; vars: Variant[]; mats: JscMat[]; prices: Price[]; onDone: () => void }) {
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    const lines = [COLS.join(",")];
    for (const c of cats) {
      const ms = mats.filter((m) => m.material_catalog_id === c.id);
      const pr = prices.filter((p) => ms.some((m) => m.id === p.material_id));
      const variantRows = vars.filter((v) => v.material_id === c.id && v.is_active);
      for (const p of pr) {
        const m = ms.find((x) => x.id === p.material_id);
        const v = vars.find((x) => x.id === m?.variant_id);
        lines.push([p.id, c.slug, v?.code ?? "", p.price_kind ?? "vente", p.unit, p.selling_price, p.purchase_price, p.minimum_quantity, p.max_quantity,
          p.zone_label, p.valid_from, p.valid_to, p.transport_included ? "oui" : "non", p.auto_quote_enabled ? "oui" : "non", p.priority, p.zero_price_confirmed ? "oui" : "non", "non"].map(esc).join(","));
      }
      // Gabarit vide pour chaque matériau / variante sans tarif (aucun prix inventé).
      if (!pr.length) {
        if (!variantRows.length) lines.push(["", c.slug, "", "vente", "tonne", "", "", "", "", "", "", "", "non", "non", 0, "non", "non"].map(esc).join(","));
        for (const v of variantRows) lines.push(["", c.slug, v.code, "vente", "tonne", "", "", "", "", "", "", "", "non", "non", 0, "non", "non"].map(esc).join(","));
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tarifs-materiaux-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const onFile = async (f: File) => {
    const rows = parseCsv(await f.text());
    const head = rows[0]?.map((h) => h.trim().replace(/^\uFEFF/, "")) ?? [];
    const idx = (k: string) => head.indexOf(k);
    const errs: string[] = []; const out: Planned[] = [];
    if (idx("material_slug") < 0 || idx("selling_price") < 0) { setErrors(["En-têtes requis : material_slug, selling_price (utilisez l'export comme gabarit)."]); setPlan([]); return; }
    rows.slice(1).forEach((r, i) => {
      const line = i + 2; const g = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
      const slug = g("material_slug"); const cat = cats.find((c) => c.slug === slug);
      if (!cat) { errs.push(`Ligne ${line} : matériau « ${slug} » introuvable.`); return; }
      const vcode = g("variant_code"); const variant = vcode ? vars.find((v) => v.material_id === cat.id && v.code === vcode) : null;
      if (vcode && !variant) { errs.push(`Ligne ${line} : variante « ${vcode} » introuvable pour ${slug}.`); return; }
      const unit = g("unit") || "tonne"; if (!UNITS.includes(unit)) { errs.push(`Ligne ${line} : unité « ${unit} » invalide (${UNITS.join(", ")}).`); return; }
      const kind = g("price_kind") || "vente"; if (!KINDS.includes(kind)) { errs.push(`Ligne ${line} : nature « ${kind} » invalide.`); return; }
      const sp = numOrNull(g("selling_price")), pp = numOrNull(g("purchase_price")), mn = numOrNull(g("minimum_quantity")), mx = numOrNull(g("max_quantity"));
      if ([sp, pp, mn, mx].includes("err")) { errs.push(`Ligne ${line} : nombre invalide.`); return; }
      if (sp === 0 && !yes(g("zero_price_confirmed"))) { errs.push(`Ligne ${line} : 0 $ exige zero_price_confirmed = oui.`); return; }
      for (const d of ["valid_from", "valid_to"]) if (g(d) && !/^\d{4}-\d{2}-\d{2}$/.test(g(d))) { errs.push(`Ligne ${line} : date ${d} invalide (AAAA-MM-JJ).`); return; }
      const payload = {
        price_kind: kind, unit, selling_price: sp, purchase_price: pp, minimum_quantity: mn, max_quantity: mx,
        zone_label: g("zone_label") || null, valid_from: g("valid_from") || null, valid_to: g("valid_to") || null,
        transport_included: yes(g("transport_included")), auto_quote_enabled: yes(g("auto_quote_enabled")),
        priority: Number(g("priority")) || 0, zero_price_confirmed: sp === 0 && yes(g("zero_price_confirmed")),
      };
      const label = `${cat.name_fr}${variant ? ` — ${variant.label_fr}` : ""}`;
      const pid = g("price_id");
      if (pid) {
        const ex = prices.find((p) => p.id === pid);
        if (!ex) { errs.push(`Ligne ${line} : price_id inconnu.`); return; }
        if (ex.selling_price != null && sp !== ex.selling_price && !yes(g("remplacer"))) {
          out.push({ line, action: "skip", label, payload, note: `prix existant ${ex.selling_price} $ conservé (remplacer = non)` }); return;
        }
        out.push({ line, action: "update", label, payload, priceId: pid });
      } else {
        if (sp == null) { out.push({ line, action: "skip", label, payload, note: "ligne sans prix ignorée" }); return; }
        out.push({ line, action: "create", label, payload, slug, variantCode: vcode || undefined });
      }
    });
    setErrors(errs); setPlan(out);
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true); let ok = 0; const errs: string[] = [];
    for (const p of plan) {
      if (p.action === "update") {
        const { error } = await supabase.from("jsc_material_prices").update(p.payload as never).eq("id", p.priceId!);
        if (error) errs.push(`Ligne ${p.line} : ${error.message}`); else ok++;
      } else if (p.action === "create") {
        const cat = cats.find((c) => c.slug === p.slug)!;
        const variant = p.variantCode ? vars.find((v) => v.material_id === cat.id && v.code === p.variantCode) : null;
        let mat = mats.find((m) => m.material_catalog_id === cat.id && (m.variant_id ?? null) === (variant?.id ?? null) && (variant ? true : !m.granulometry_id));
        if (!mat) {
          const { data, error } = await supabase.from("jsc_materials").insert({
            name: variant ? `${cat.name_fr} — ${variant.label_fr}` : cat.name_fr, material_catalog_id: cat.id, variant_id: variant?.id ?? null,
            allowed_units: UNITS, is_public: false,
          } as never).select("id,name,material_catalog_id,granulometry_id,variant_id,allowed_units,density_kg_per_m3").single();
          if (error) { errs.push(`Ligne ${p.line} : ${error.message}`); continue; }
          mat = data as JscMat; mats.push(mat);
        }
        const { error } = await supabase.from("jsc_material_prices").insert({ material_id: mat.id, ...p.payload } as never);
        if (error) errs.push(`Ligne ${p.line} : ${error.message}`); else ok++;
      }
    }
    setBusy(false); setErrors(errs);
    toast.success(`${ok} tarif(s) importé(s)${errs.length ? `, ${errs.length} erreur(s)` : ""}.`);
    if (!errs.length) setPlan(null);
    onDone();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Exporter CSV</Button>
      <label className="inline-flex">
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
        <span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm"><Upload className="mr-1 h-4 w-4" /> Importer CSV</span>
      </label>
      <Dialog open={plan != null} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Aperçu de l'import</DialogTitle></DialogHeader>
          {errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
          <div className="max-h-80 overflow-y-auto text-xs">
            <table className="w-full"><tbody>
              {(plan ?? []).map((p) => (
                <tr key={p.line} className="border-t">
                  <td className="p-1">L{p.line}</td>
                  <td className="p-1 font-medium">{p.action === "create" ? "Nouveau" : p.action === "update" ? "Mise à jour" : "Ignoré"}</td>
                  <td className="p-1">{p.label}</td>
                  <td className="p-1">{p.payload.selling_price == null ? "vide" : `${p.payload.selling_price} $ / ${p.payload.unit}`}</td>
                  <td className="p-1 text-muted-foreground">{p.note}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlan(null)}>Annuler</Button>
            <Button onClick={apply} disabled={busy || !(plan ?? []).some((p) => p.action !== "skip")}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
