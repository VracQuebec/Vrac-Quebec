import { describe, it, expect } from "vitest";
import { interpretQuoteSubmit } from "./submitResult";

describe("interprétation de la réponse quote-submit", () => {
  it("succès complet : demande enregistrée et courriel envoyé", () => {
    const r = interpretQuoteSubmit(
      { ok: true, quote_number: "SOU-0001", request_number: "DEM-0001", valid_until: "2026-11-01", emailed_to: "a@b.c", email_sent: true },
      null,
    );
    expect(r).toMatchObject({ kind: "recorded", quote_number: "SOU-0001", request_number: "DEM-0001", email_sent: true });
  });

  it("courriel en échec APRÈS enregistrement (502 avec numéros) : jamais présenté comme un échec", () => {
    const r = interpretQuoteSubmit(null, {
      ok: false,
      error: "courriel échoué",
      quote_number: "SOU-0002",
      request_number: "DEM-0002",
    });
    expect(r.kind).toBe("recorded");
    expect(r).toMatchObject({ quote_number: "SOU-0002", request_number: "DEM-0002", email_sent: false });
  });

  it("ancien serveur : ok:false mais numéros présents dans le corps 2xx → enregistrée", () => {
    const r = interpretQuoteSubmit({ ok: false, request_number: "DEM-0003" }, null);
    expect(r).toMatchObject({ kind: "recorded", request_number: "DEM-0003", email_sent: false });
  });

  it("nouveau serveur : ok:true avec email_sent:false → enregistrée, courriel signalé non envoyé", () => {
    const r = interpretQuoteSubmit({ ok: true, email_sent: false, quote_number: "SOU-0004", request_number: "DEM-0004" }, null);
    expect(r).toMatchObject({ kind: "recorded", email_sent: false });
  });

  it("refus serveur SANS numéro : jamais de succès", () => {
    const r = interpretQuoteSubmit({ ok: false, error: "Quantité invalide." }, null);
    expect(r).toEqual({ kind: "failed", message: "Quantité invalide." });
  });

  it("erreur réseau sans corps : échec honnête", () => {
    const r = interpretQuoteSubmit(null, null, "Failed to fetch");
    expect(r).toEqual({ kind: "failed", message: "Failed to fetch" });
  });
});
