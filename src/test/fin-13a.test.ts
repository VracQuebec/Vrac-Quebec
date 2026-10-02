import { describe, expect, it } from "vitest";
import { autoMapBank, buildRows, displayStatus, parseCsv, settingsProblem } from "@/lib/finances/bank";

describe("FIN-13A relevé bancaire (lecture pure)", () => {
  const csv = "\uFEFFDate;Libellé;Débit;Crédit;Identifiant\n02/10/2026;PAIEMENT;1 200,00;;0012\n02/10/2026;DEPOT;;50,00;\n";
  const p = parseCsv(csv);
  const map = autoMapBank(p.rows[0]);
  it("associe les colonnes et conserve les valeurs originales (zéros initiaux)", () => {
    expect(map).toEqual(["date", "description", "debit", "credit", "bank_id"]);
    const r = buildRows(p.rows, map);
    expect(r[0]).toMatchObject({ row_no: 2, debit: "1 200,00", bank_id: "0012" });
    expect(r[0].raw["Débit"]).toBe("1 200,00");
  });
  it("exige des choix explicites de format et de sens", () => {
    expect(settingsProblem(map, { date_fmt: null, num_fmt: null, mode: null, sign: null })).toMatch(/montant signé ou deux colonnes/);
    expect(settingsProblem(map, { date_fmt: null, num_fmt: "fr", mode: "split", sign: null })).toMatch(/dates/);
    expect(settingsProblem(["date", "amount"], { date_fmt: "iso", num_fmt: "fr", mode: "signed", sign: null })).toMatch(/sens/);
    expect(settingsProblem(map, { date_fmt: "dmy", num_fmt: "fr", mode: "split", sign: null })).toBeNull();
  });
  it("suggestion disponible seulement pour une transaction à rapprocher", () => {
    expect(displayStatus({ status: "a_rapprocher", suggest: true })).toBe("suggestion");
    expect(displayStatus({ status: "exclu", suggest: true })).toBe("exclu");
  });
});
