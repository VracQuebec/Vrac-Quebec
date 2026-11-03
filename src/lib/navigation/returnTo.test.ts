import { describe, it, expect } from "vitest";
import { allowedReturnPath } from "./returnTo";

describe("allowedReturnPath", () => {
  it("ne renvoie jamais un non-admin vers une page admin", () => {
    expect(allowedReturnPath("/admin/temoins", false)).toBeNull();
    expect(allowedReturnPath("/admin", false)).toBeNull();
  });
  it("reprend la page admin pour un admin et les pages entrepreneur pour tous", () => {
    expect(allowedReturnPath("/admin/temoins", true)).toBe("/admin/temoins");
    expect(allowedReturnPath("/entrepreneur/crm", false)).toBe("/entrepreneur/crm");
  });
});
