import { describe, it, expect } from "vitest";
import { entrepreneurSignupRole } from "../../supabase/functions/signup-entrepreneur/role";
import { approvedRoleHints } from "@/lib/auth/approved-roles";

describe("inscription entrepreneur sans approbation manuelle", () => {
  it("attribue automatiquement le seul rôle entrepreneur actif", () => {
    expect(entrepreneurSignupRole("test-user")).toEqual({ user_id: "test-user", role: "entrepreneur", approved: true });
  });
  it("la suspension explicite continue de retirer les accès", () => {
    expect(approvedRoleHints([{role: "entrepreneur", approved: false}])).toEqual([]);
  });
  it("l’inscription ne donne jamais de rôle admin", () => {
    expect(approvedRoleHints([entrepreneurSignupRole("test-user")])).not.toContain("admin");
  });
});