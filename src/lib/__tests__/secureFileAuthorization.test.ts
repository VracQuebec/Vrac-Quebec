// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: session } } }));
import { fetchSecureFile } from "../secureFile";

afterEach(() => vi.unstubAllGlobals());
describe("droits revérifiés à chaque ouverture", () => {
  it("ne réutilise pas un document après révocation", async () => {
    session.mockResolvedValue({ data: { session: { access_token: "test-only-token" } } });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("original", { status: 200 })).mockResolvedValueOnce(new Response("refus", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchSecureFile("company-docs", "TEST/document.pdf")).size).toBe(8);
    await expect(fetchSecureFile("company-docs", "TEST/document.pdf")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].cache).toBe("no-store");
  });
  it("refuse une session absente avant tout transfert", async () => {
    session.mockResolvedValue({ data: { session: null } });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fetchSecureFile("asr-files", "TEST/document.pdf")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});