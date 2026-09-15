import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT, SORT_OPTIONS, parseLeadSort, sortLabel, sortLeads, compareLeads,
  estimateMatchCounts, matchPotential, estimatedTrips, applyServerOrder, pageRange,
  isClientOnlySort, type SortableLead,
} from "@/lib/crm/leadSort";
import { needsClientMode, emptyFilters, LEADS_PAGE_SIZE } from "@/lib/crm/leadsQuery";

const lead = (p: Partial<SortableLead> & { id: string }): SortableLead => ({
  created_at: "2026-01-01T00:00:00Z", ...p,
});

describe("Tri des leads du CRM", () => {
  it("tri par défaut : plus récents", () => {
    expect(DEFAULT_SORT).toBe("recent");
    expect(parseLeadSort(null)).toBe("recent");
    expect(parseLeadSort("n-importe-quoi")).toBe("recent");
    expect(parseLeadSort("quantite_asc")).toBe("quantite_asc");
    expect(sortLabel("recent")).toBe("Plus récents");
  });

  it("plus récents et plus anciens", () => {
    const rows = [
      lead({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
      lead({ id: "b", created_at: "2026-03-01T00:00:00Z" }),
      lead({ id: "c", created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortLeads(rows, "recent").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortLeads(rows, "oldest").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("dates identiques : ordre stable par identifiant", () => {
    const rows = [
      lead({ id: "z", created_at: "2026-01-01T00:00:00Z" }),
      lead({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
      lead({ id: "m", created_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(sortLeads(rows, "recent").map((r) => r.id)).toEqual(["a", "m", "z"]);
    expect(sortLeads(rows, "oldest").map((r) => r.id)).toEqual(["a", "m", "z"]);
  });

  it("données nulles toujours à la fin, dans les deux sens", () => {
    const rows = [
      lead({ id: "sans" }),
      lead({ id: "tot", desired_date: "2026-04-01" }),
      lead({ id: "tard", desired_date: "2026-09-01" }),
    ];
    expect(sortLeads(rows, "travaux_proche").map((r) => r.id)).toEqual(["tot", "tard", "sans"]);
    expect(sortLeads(rows, "travaux_loin").map((r) => r.id)).toEqual(["tard", "tot", "sans"]);
  });

  it("date de travaux imminente en premier", () => {
    const rows = [
      lead({ id: "loin", desired_date: "2026-12-01" }),
      lead({ id: "demain", desired_date: "2026-09-16" }),
    ];
    expect(sortLeads(rows, "travaux_proche")[0].id).toBe("demain");
  });

  it("prochaine relance dépassée en premier", () => {
    const rows = [
      lead({ id: "futur", next_follow_up_at: "2026-10-01T09:00:00Z" }),
      lead({ id: "depasse", next_follow_up_at: "2026-08-01T09:00:00Z" }),
      lead({ id: "aucun" }),
    ];
    expect(sortLeads(rows, "suivi_urgent").map((r) => r.id)).toEqual(["depasse", "futur", "aucun"]);
    expect(sortLeads(rows, "suivi_loin").map((r) => r.id)).toEqual(["futur", "depasse", "aucun"]);
  });

  it("modifiés récemment / il y a le plus longtemps", () => {
    const rows = [
      lead({ id: "vieux", updated_at: "2026-02-01T00:00:00Z" }),
      lead({ id: "neuf", updated_at: "2026-08-01T00:00:00Z" }),
      lead({ id: "jamais" }),
    ];
    expect(sortLeads(rows, "modif_recent").map((r) => r.id)).toEqual(["neuf", "vieux", "jamais"]);
    expect(sortLeads(rows, "modif_ancien").map((r) => r.id)).toEqual(["vieux", "neuf", "jamais"]);
  });

  it("priorité urgente en premier", () => {
    const rows = [lead({ id: "n", priority: "normal" }), lead({ id: "u", priority: "urgent" }), lead({ id: "x" })];
    expect(sortLeads(rows, "priorite_urgente").map((r) => r.id)).toEqual(["u", "n", "x"]);
  });

  it("quantité et nombre de voyages, sans transformer l'absence en zéro", () => {
    const rows = [
      lead({ id: "q10", quantity_value: 10, quantity: "10 voyages" }),
      lead({ id: "q50", quantity_value: 50, quantity: "50 voyages" }),
      lead({ id: "vide" }),
    ];
    expect(estimatedTrips(rows[2])).toBeNull();
    expect(estimatedTrips(rows[0])).toBe(10);
    expect(sortLeads(rows, "quantite_desc").map((r) => r.id)).toEqual(["q50", "q10", "vide"]);
    expect(sortLeads(rows, "quantite_asc").map((r) => r.id)).toEqual(["q10", "q50", "vide"]);
    expect(sortLeads(rows, "voyages_desc").map((r) => r.id)).toEqual(["q50", "q10", "vide"]);
    expect(sortLeads(rows, "voyages_asc").map((r) => r.id)).toEqual(["q10", "q50", "vide"]);
  });

  it("distance : plus proche puis plus éloignée, inconnues à la fin", () => {
    const rows = [
      lead({ id: "loin", quote_distance_km: 90 }),
      lead({ id: "proche", quote_distance_km: 5 }),
      lead({ id: "inconnue" }),
    ];
    expect(sortLeads(rows, "distance_proche").map((r) => r.id)).toEqual(["proche", "loin", "inconnue"]);
    expect(sortLeads(rows, "distance_loin").map((r) => r.id)).toEqual(["loin", "proche", "inconnue"]);
  });

  it("nom du client A→Z et Z→A, sans nom à la fin", () => {
    const rows = [lead({ id: "1", name: "Zoé" }), lead({ id: "2", name: "Alain" }), lead({ id: "3" })];
    expect(sortLeads(rows, "client_az").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortLeads(rows, "client_za").map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("potentiel de jumelage : estimation, nulle si aucune information", () => {
    const riche = lead({ id: "r", materials: ["terre"], latitude: 46.8, longitude: -71.2, quantity_value: 20, address: "1 rue X", availability_status: "available" });
    const pauvre = lead({ id: "p", materials: ["terre"] });
    const vide = lead({ id: "v" });
    expect(matchPotential(vide)).toBeNull();
    expect(matchPotential(riche)!).toBeGreaterThan(matchPotential(pauvre)!);
    expect(sortLeads([vide, pauvre, riche], "potentiel").map((r) => r.id)).toEqual(["r", "p", "v"]);
  });

  it("nombre de matchs compatibles : jamais 0 quand l'information manque", () => {
    const rows = [
      lead({ id: "remblai", request_type: "remblai", materials: ["terre"], latitude: 46.8, longitude: -71.2 }),
      lead({ id: "vrac1", request_type: "vrac", materials: ["terre"], latitude: 46.81, longitude: -71.21 }),
      lead({ id: "vrac2", request_type: "vrac", materials: ["terre"], latitude: 48.9, longitude: -68.0 }),
      lead({ id: "inconnu", request_type: "vrac" }),
    ];
    const counts = estimateMatchCounts(rows);
    expect(counts.get("remblai")).toBe(1);
    expect(counts.get("inconnu")).toBeNull();
    const desc = sortLeads(rows, "matchs_desc", { matchCounts: counts }).map((r) => r.id);
    expect(desc[0]).toBe("remblai");
    expect(desc[desc.length - 1]).toBe("inconnu");
    const asc = sortLeads(rows, "matchs_asc", { matchCounts: counts }).map((r) => r.id);
    expect(asc[asc.length - 1]).toBe("inconnu");
  });

  it("critère secondaire stable : création décroissante puis identifiant", () => {
    const rows = [
      lead({ id: "b", created_at: "2026-01-01T00:00:00Z", priority: "urgent" }),
      lead({ id: "a", created_at: "2026-05-01T00:00:00Z", priority: "urgent" }),
      lead({ id: "c", created_at: "2026-05-01T00:00:00Z", priority: "urgent" }),
    ];
    expect(sortLeads(rows, "priorite_urgente").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("pagination stable : aucun doublon ni résultat manquant", () => {
    const rows = Array.from({ length: 125 }, (_, i) =>
      lead({ id: `id-${String(i).padStart(3, "0")}`, created_at: new Date(2026, 0, 1 + (i % 7)).toISOString() }));
    const sorted = sortLeads(rows, "recent");
    const pages: string[] = [];
    for (let p = 1; p <= Math.ceil(rows.length / LEADS_PAGE_SIZE); p++) {
      const [from, to] = pageRange(p, LEADS_PAGE_SIZE);
      pages.push(...sorted.slice(from, to + 1).map((r) => r.id));
    }
    expect(pages.length).toBe(125);
    expect(new Set(pages).size).toBe(125);
    expect(pages).toEqual(sorted.map((r) => r.id));
  });

  it("tri serveur : colonne choisie puis critères secondaires", () => {
    const calls: [string, { ascending: boolean; nullsFirst: boolean }][] = [];
    const q: any = { order: (c: string, o: any) => { calls.push([c, o]); return q; } };
    applyServerOrder(q, "travaux_proche");
    expect(calls.map((c) => c[0])).toEqual(["desired_date", "created_at", "id"]);
    expect(calls[0][1]).toEqual({ ascending: true, nullsFirst: false });
  });

  it("filtre + recherche + tri se combinent sans se confondre", () => {
    const filters = { ...emptyFilters(), status: "nouveau", search: "tremblay", dateFrom: "2026-01-01" };
    expect(needsClientMode(filters, "recent")).toBe(false);
    expect(needsClientMode({ ...filters, trips: "10-25" }, "recent")).toBe(true);
    expect(needsClientMode(filters, "potentiel")).toBe(true);
    expect(isClientOnlySort("distance_proche")).toBe(false);
  });

  it("toutes les options annoncées sont disponibles", () => {
    expect(SORT_OPTIONS.length).toBe(20);
    const cmp = compareLeads("recent");
    expect(typeof cmp).toBe("function");
  });
});
