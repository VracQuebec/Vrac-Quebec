import { describe, it, expect } from "vitest";
import { approvedRoleHints } from "@/lib/auth/approved-roles";
describe("navigation et rôles approuvés", () => {
  it("admin non approuvé ne donne aucun accès administrateur", () => {
    expect(approvedRoleHints([{role:"admin",approved:false}])).toEqual([]);
  });
  it("entrepreneur approuvé ne devient jamais administrateur", () => {
    expect(approvedRoleHints([{role:"entrepreneur",approved:true}])).toEqual(["entrepreneur"]);
  });
  it("admin approuvé est conservé sans inventer de rôle", () => {
    expect(approvedRoleHints([{role:"admin",approved:true},{role:"user",approved:null}])).toEqual(["admin"]);
  });
});