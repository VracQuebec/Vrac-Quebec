import { describe, expect, it, beforeEach } from "vitest";
import { listCtxKey, readListCtx, writeListCtx } from "@/lib/navigation/listContext";

describe("NAV-01B contexte des listes", () => {
  beforeEach(() => sessionStorage.clear());
  const A = { owner: "u1", company: "c1", list: "finances-occ" };
  it("relit exactement les valeurs", () => {
    writeListCtx(A, { qy: { q: "assurance", sort: "amount_desc" }, page: 3 });
    expect(readListCtx(A)).toEqual({ qy: { q: "assurance", sort: "amount_desc" }, page: 3 });
  });
  it("isole compte, entreprise et liste", () => {
    writeListCtx(A, { q: "x" });
    expect(readListCtx({ ...A, owner: "u2" })).toBeNull();
    expect(readListCtx({ ...A, company: "c2" })).toBeNull();
    expect(readListCtx({ ...A, list: "finances-pay" })).toBeNull();
    expect(new Set([listCtxKey(A), listCtxKey({ ...A, company: null })]).size).toBe(2);
  });
  it("valeur corrompue = aucun contexte", () => {
    sessionStorage.setItem(listCtxKey(A), "{oops");
    expect(readListCtx(A)).toBeNull();
  });
  it("jamais dans l'adresse", () => {
    writeListCtx(A, { q: "perso" });
    expect(window.location.href).not.toContain("perso");
  });
});
