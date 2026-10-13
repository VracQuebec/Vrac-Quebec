import { describe, it, expect } from "vitest";
import { buildRefusedRows, filterRefused, type RefusedTaskRaw } from "@/lib/seo/refusedTasks";

const t = (id: string, city: string, err: string | null, at: string): RefusedTaskRaw => ({
  id, city_slug: city, material_slug: "remblai", service_slug: null, status: "needs_retry", attempts: 1, last_error: err, updated_at: at, finished_at: null,
});
const ctx = { cityName: (s: string) => (s === "weedon" ? "Weedon" : null), comboLabel: () => "Remblai", availability: () => "inconnue" as const };
const empty = { city: "", combo: "", availability: "", reason: "" };

describe("Tâches refusées", () => {
  it("affiche une seule ligne par tâche, sans doublon", () => {
    const rows = buildRefusedRows([t("1", "weedon", "x", "2026-10-12"), t("1", "weedon", "x", "2026-10-12"), t("2", "adstock", "x", "2026-10-11")], ctx);
    expect(rows).toHaveLength(2);
  });
  it("n'invente pas un nom de ville ni un motif absent", () => {
    const [r] = buildRefusedRows([t("2", "adstock", null, "2026-10-11")], ctx);
    expect(r.cityName).toBeNull();
    expect(r.reason).toBeNull();
  });
  it("filtre par ville et par motif", () => {
    const rows = buildRefusedRows([t("1", "weedon", "A", "2026-10-12"), t("2", "adstock", "B", "2026-10-11")], ctx);
    expect(filterRefused(rows, { ...empty, city: "weedon" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterRefused(rows, { ...empty, reason: "B" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterRefused(rows, empty)).toHaveLength(2);
  });
});
