import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { claimGroup } from "@/lib/facebook-groups/api";
describe("attribution Facebook via autorité serveur", () => {
  beforeEach(() => rpc.mockReset());
  it("signale le détenteur concurrent sans tenter de le remplacer", async () => {
    rpc.mockResolvedValue({ data: { ok: false, heldBy: "other-admin" }, error: null });
    expect(await claimGroup("group", "campaign", 1, "admin")).toEqual({ ok: false, heldBy: "other-admin" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fb_claim_group", { p_group: "group", p_campaign: "campaign", p_cycle: 1 });
  });
  it("ne transforme pas un refus serveur en attribution locale", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("Accès refusé") });
    await expect(claimGroup("group", "campaign", 1, "entrepreneur")).rejects.toThrow("Accès refusé");
  });
});