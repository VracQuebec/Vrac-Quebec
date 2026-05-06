import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, X, FileText, CheckCircle2 } from "lucide-react";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";

// Column aliases — normalized (lowercase, no accents/spaces) → canonical key
const ALIASES: Record<string, string> = {
  // name
  nom: "lastname", surname: "lastname", lastname: "lastname", famille: "lastname",
  prenom: "firstname", firstname: "firstname",
  fullname: "name", nomcomplet: "name", nomclient: "name", client: "name",
  // contact
  telephone: "phone", tel: "phone", phone: "phone", mobile: "phone", cellulaire: "phone", numero: "phone", numerodetelephone: "phone",
  courriel: "email", email: "email", mail: "email", adresseemail: "email", adressecourriel: "email",
  // address
  adresse: "address", adressecivique: "address", adresseclient: "address", rue: "address", address: "address",
  codepostal: "postal_code", cp: "postal_code", zip: "postal_code", zipcode: "postal_code", postal: "postal_code",
  latitude: "latitude", lat: "latitude",
  longitude: "longitude", lng: "longitude", lon: "longitude", long: "longitude",
  pointmap: "gps", pointsurlamap: "gps", gps: "gps", coordonnees: "gps", coords: "gps",
  // request
  materiel: "materials", materiaux: "materials", material: "materials", materials: "materials", produit: "materials", quelmaterieldemande: "materials",
  voyages: "quantity", nombredevoyages: "quantity", quelnombredevoyagesdesire: "quantity", quantite: "quantity", qty: "quantity", quantity: "quantity",
  accessibilite: "accessibility", acces: "accessibility", accessibility: "accessibility", accessibiliteduterrain: "accessibility", camion: "accessibility",
  machinerie: "machinery", machineriesurplace: "machinery", avezvousdelamachineriesurplace: "machinery", machinery: "machinery",
  budget: "budget", montant: "budget", prix: "budget", quelmontantseriezvouspretapayer: "budget", quelmontantseriezvouspretapayerparvoyage: "budget", budgetparvoyage: "budget",
  note: "description", notes: "description", description: "description", commentaire: "description", commentaires: "description", noteclient: "description",
};

const norm = (s: string) =>
  s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Minimal CSV parser that handles quoted fields and commas/semicolons
function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  // Detect delimiter from header line
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v && v.trim() !== ""));
}

function matchMaterials(value: string): string[] {
  if (!value) return [];
  const parts = value.split(/[|,;\/]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const n = norm(p);
    const m = MATERIAL_TYPES.find((mt) => norm(mt.label).includes(n) || n.includes(norm(mt.label)) || norm(mt.id) === n);
    out.push(m ? m.id : "autre");
  }
  return Array.from(new Set(out));
}

function parseGps(v: string): { lat: number | null; lng: number | null } {
  if (!v) return { lat: null, lng: null };
  const m = v.match(/(-?\d+(?:\.\d+)?)[\s,;]+(-?\d+(?:\.\d+)?)/);
  if (!m) return { lat: null, lng: null };
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

async function geocode(address: string, postal: string): Promise<{ lat: number; lng: number } | null> {
  const queries = [
    `${address} ${postal} Quebec Canada`.trim(),
    `${address} Quebec Canada`.trim(),
    `${postal} Canada`.trim(),
  ];
  for (const q of queries) {
    if (!q) continue;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=ca`);
      const j = await r.json();
      if (j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1100)); // rate limit
  }
  return null;
}

interface Props { onClose: () => void; onImported: () => void }

export default function CsvImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);
  const [doGeocode, setDoGeocode] = useState(true);

  const TARGETS = [
    { v: "", label: "— Ignorer —" },
    { v: "name", label: "Nom complet" },
    { v: "firstname", label: "Prénom" },
    { v: "lastname", label: "Nom de famille" },
    { v: "phone", label: "Téléphone" },
    { v: "email", label: "Courriel" },
    { v: "address", label: "Adresse civique" },
    { v: "postal_code", label: "Code postal" },
    { v: "latitude", label: "Latitude" },
    { v: "longitude", label: "Longitude" },
    { v: "gps", label: "Point GPS (lat,lng)" },
    { v: "materials", label: "Matériel demandé" },
    { v: "quantity", label: "Nombre de voyages" },
    { v: "accessibility", label: "Accessibilité du terrain" },
    { v: "machinery", label: "Machinerie sur place" },
    { v: "budget", label: "Budget par voyage" },
    { v: "description", label: "Note / description" },
  ];

  const handleFile = async (f: File) => {
    setFile(f);
    setDone(null);
    const text = await f.text();
    const all = parseCSV(text);
    if (all.length < 1) { toast({ title: "CSV vide", variant: "destructive" }); return; }
    const hdr = all[0].map((h) => h.trim());
    const data = all.slice(1);
    setHeaders(hdr);
    setRows(data);
    const map: Record<number, string> = {};
    hdr.forEach((h, i) => {
      const key = ALIASES[norm(h)];
      if (key) map[i] = key;
    });
    setMapping(map);
  };

  const startImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setProgress(0);
    let ok = 0, fail = 0;

    const colOf = (key: string) => Object.entries(mapping).find(([, v]) => v === key)?.[0];

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const get = (key: string) => {
        const idx = colOf(key);
        return idx != null ? (row[Number(idx)] || "").trim() : "";
      };
      try {
        let name = get("name");
        if (!name) {
          const fn = get("firstname"), ln = get("lastname");
          name = `${fn} ${ln}`.trim();
        }
        const email = get("email") || `import+${Date.now()}-${r}@vracquebec.ca`;
        const phone = get("phone");
        const address = get("address") || "—";
        const postal_code = get("postal_code");
        let latitude: number | null = parseFloat(get("latitude")) || null;
        let longitude: number | null = parseFloat(get("longitude")) || null;
        const gps = parseGps(get("gps"));
        if (gps.lat != null) { latitude = gps.lat; longitude = gps.lng; }
        if (doGeocode && latitude == null && (address !== "—" || postal_code)) {
          const g = await geocode(address, postal_code);
          if (g) { latitude = g.lat; longitude = g.lng; }
        }
        const materials = matchMaterials(get("materials"));
        const quantity = get("quantity") || "Non spécifié";
        const accValue = get("accessibility");
        const accessibility = accValue ? accValue.split(/[|,;\/]+/).map((s) => s.trim()).filter(Boolean) : [];
        const machRaw = get("machinery").toLowerCase();
        const machinery_available = /oui|yes|true|1|✓/.test(machRaw);
        const machinery_description = machinery_available ? get("machinery") : "";
        const budget = get("budget");

        const payload = {
          name: name || "Sans nom",
          email,
          phone,
          address,
          postal_code,
          latitude,
          longitude,
          materials: materials.length > 0 ? materials : ["ne-sais-pas"],
          property_type: "Importé CSV",
          quantity,
          tonnage: "—",
          accessibility,
          machinery_available,
          machinery_description,
          budget_max: budget,
          budget_unit: budget ? "$/voyage" : "",
          description: get("description"),
          status: "nouveau",
          request_type: "livraison",
          internal_notes: `Importé depuis CSV le ${new Date().toLocaleDateString("fr-CA")}`,
          visible_to_entrepreneur: true,
        };

        const { error } = await supabase.from("submissions").insert(payload as any);
        if (error) { fail++; console.error("Import row", r, error); } else ok++;
      } catch (e) {
        console.error(e); fail++;
      }
      setProgress(Math.round(((r + 1) / rows.length) * 100));
    }

    setBusy(false);
    setDone({ ok, fail });
    toast({ title: "Import terminé", description: `${ok} importés, ${fail} en erreur` });
    onImported();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Importer des leads (CSV)
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {!file && (
            <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-secondary/40">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-display font-semibold mb-1">Choisir un fichier CSV</p>
              <p className="text-xs text-muted-foreground">Délimiteur , ou ; — UTF-8 recommandé</p>
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          )}

          {file && headers.length > 0 && !done && (
            <>
              <div className="flex items-center justify-between bg-secondary/40 rounded-lg p-3">
                <div className="text-sm">
                  <p className="font-display font-semibold">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{rows.length} lignes • {headers.length} colonnes</p>
                </div>
                <button onClick={() => { setFile(null); setRows([]); setHeaders([]); setMapping({}); }}
                  className="text-xs text-primary hover:underline">Changer</button>
              </div>

              <div>
                <p className="font-display font-semibold text-sm mb-2">Mapping des colonnes (auto-détecté)</p>
                <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-1.5 bg-secondary/50 rounded text-xs font-mono truncate">{h || `(col ${i + 1})`}</div>
                      <span className="text-muted-foreground text-xs">→</span>
                      <select value={mapping[i] || ""} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}
                        className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-card font-body">
                        {TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-body">
                <input type="checkbox" checked={doGeocode} onChange={(e) => setDoGeocode(e.target.checked)} />
                Géocoder automatiquement les adresses sans GPS (≈1s/ligne)
              </label>

              {busy ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Import en cours… {progress}%</div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <button onClick={startImport}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold">
                  Importer {rows.length} leads
                </button>
              )}
            </>
          )}

          {done && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
              <p className="font-display font-bold text-lg">{done.ok} leads importés</p>
              {done.fail > 0 && <p className="text-sm text-destructive mt-1">{done.fail} en erreur (voir console)</p>}
              <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-display font-semibold">Fermer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}