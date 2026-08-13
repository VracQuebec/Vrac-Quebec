import { describe, it, expect } from "vitest";
import {
  loadVisibilityAudit,
  visibilityLabel,
  formatAuditDate,
} from "@/lib/parcours/visibilite-audit";

type Row = Record<string, unknown>;

/** Client simulé : reproduit la policy admin de crm_audit_log. */
const makeClient = (opts: {
  isAdmin?: boolean;
  rows?: Row[];
  entrepreneurs?: Row[];
  fail?: string;
}) => {
  const { isAdmin = true, rows = [], entrepreneurs = [], fail } = opts;
  const selected: string[] = [];
  const client = {
    lastSelect: () => selected,
    from(table: string) {
      const q: any = {
        select(cols: string) { selected.push(`${table}:${cols}`); return q; },
        eq() { return q; },
        in() { return q; },
        order() { return q; },
        limit() { return q; },
        then(resolve: (v: unknown) => void) {
          if (fail) return resolve({ data: null, error: { message: fail } });
          if (!isAdmin) return resolve({ data: null, error: { message: "permission denied for table crm_audit_log" } });
          return resolve({ data: table === "crm_audit_log" ? rows : entrepreneurs, error: null });
        },
      };
      return q;
    },
  };
  return client as any;
};

const ROW = {
  id: "a1",
  owner_id: "e1",
  old_value: false,
  new_value: true,
  actor_id: "u1",
  actor_email: "admin@vracquebec.ca",
  created_at: "2026-08-13T14:30:00.000Z",
};

describe("Historique admin de visibilité réseau", () => {
  it("A — un administrateur peut consulter l'historique", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW], entrepreneurs: [{ id: "e1", company: "Excavation ABC" }] }));
    expect(res.state).toBe("ok");
    if (res.state !== "ok") return;
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].company).toBe("Excavation ABC");
  });

  it("B — un utilisateur normal est refusé", async () => {
    const res = await loadVisibilityAudit(makeClient({ isAdmin: false, rows: [ROW] }));
    expect(res.state).toBe("unauthorized");
  });

  it("C — l'ancien état est correct", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].from).toBe(false);
    expect(visibilityLabel(res.entries[0].from)).toBe("Masqué");
  });

  it("D — le nouvel état est correct", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].to).toBe(true);
    expect(visibilityLabel(res.entries[0].to)).toBe("Visible");
  });

  it("E — l'acteur est correct (courriel, sinon identifiant)", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW, { ...ROW, id: "a2", actor_email: null }] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].actor).toBe("admin@vracquebec.ca");
    expect(res.entries[1].actor).toBe("u1");
  });

  it("F — la date est conservée et formatée", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].at).toBe("2026-08-13T14:30:00.000Z");
    expect(formatAuditDate(res.entries[0].at)).not.toBe("—");
    expect(formatAuditDate("pas-une-date")).toBe("—");
  });

  it("G — aucune donnée privée n'est lue ni exposée", async () => {
    const client = makeClient({
      rows: [ROW],
      entrepreneurs: [{ id: "e1", company: "Excavation ABC" }],
    });
    const res = await loadVisibilityAudit(client);
    if (res.state !== "ok") throw new Error("attendu ok");
    const cols = client.lastSelect().join(" ");
    ["phone", "email,", "address", "notes", "tax", "internal"].forEach((forbidden) => {
      expect(cols.includes(forbidden)).toBe(false);
    });
    const serialized = JSON.stringify(res.entries);
    ["phone", "address", "@example", "notes"].forEach((f) => {
      expect(serialized.includes(f)).toBe(false);
    });
    expect(Object.keys(res.entries[0]).sort()).toEqual(
      ["actor", "at", "company", "entrepreneurId", "from", "id", "to"],
    );
  });

  it("H — état vide géré", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [] }));
    expect(res).toEqual({ state: "ok", entries: [] });
  });

  it("I — erreur technique remontée sans masquer l'historique", async () => {
    const res = await loadVisibilityAudit(makeClient({ fail: "connexion perdue" }));
    expect(res.state).toBe("error");
    if (res.state === "error") expect(res.message).toBe("connexion perdue");
  });

  it("J — profil sans nom : aucune invention de données", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [ROW], entrepreneurs: [] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].company).toBeNull();
    expect(res.entries[0].entrepreneurId).toBe("e1");
  });

  it("K — valeurs inconnues restent nulles (lecture seule, aucune déduction)", async () => {
    const res = await loadVisibilityAudit(makeClient({ rows: [{ ...ROW, old_value: null, new_value: null }] }));
    if (res.state !== "ok") throw new Error("attendu ok");
    expect(res.entries[0].from).toBeNull();
    expect(res.entries[0].to).toBeNull();
    expect(visibilityLabel(null)).toBe("Inconnu");
  });
});
