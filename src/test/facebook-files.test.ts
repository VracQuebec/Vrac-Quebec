import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), list: vi.fn(), upsert: vi.fn(), session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload, list: mocks.list }) },
  from: () => ({ upsert: mocks.upsert }), auth: { getSession: mocks.session },
} }));
import { attachPublicationFile, readPublicationFile } from "@/lib/facebook-groups/files";
describe("pièces Facebook originales et reprises", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.upsert.mockResolvedValue({ error: null }); });
  it("reprend le rattachement sans renvoyer ni dupliquer le fichier", async () => {
    const file = new File(["original"], "preuve.pdf", { type: "application/pdf" });
    const job = { id: "stable", uploaded: false };
    mocks.upsert.mockResolvedValueOnce({ error: new Error("interruption") });
    await expect(attachPublicationFile("publication", file, job)).rejects.toThrow("interruption");
    await attachPublicationFile("publication", file, job);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith("facebook/publication/stable", file, { upsert: false, contentType: "application/pdf" });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0].id).toBe(mocks.upsert.mock.calls[1][0].id);
  });
  it("reconnaît un envoi confirmé dont la réponse a été perdue sans remplacer les octets", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("réponse perdue") });
    mocks.list.mockResolvedValue({ data: [{ name: "stable" }], error: null });
    await attachPublicationFile("publication", new File(["original"], "photo.jpg"), { id: "stable", uploaded: false });
    expect(mocks.upload).toHaveBeenCalledTimes(1); expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("refuse une ouverture sans session avant tout transfert", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(readPublicationFile({ id: "f", publication_id: "p", bucket: "crm-docs", path: "facebook/p/f", name: "preuve.pdf", mime: "application/pdf", size: 8 })).rejects.toThrow("Session expirée");
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
});