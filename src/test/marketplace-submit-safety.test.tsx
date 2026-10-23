import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ fetch: vi.fn(), error: vi.fn(), finalize: vi.fn(), upload: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: m.error, message: vi.fn() } }));
vi.mock("@/lib/drafts/useDraft", () => ({ useDraft: () => ({ ready: true, status: "idle", finalize: m.finalize, discard: vi.fn() }) }));
vi.mock("@/components/drafts/DraftStatusBar", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({ upload: m.upload }) } } }));
import ObtenirSoumissions from "@/pages/ObtenirSoumissions";
beforeEach(() => { m.fetch.mockReset();m.error.mockReset();m.finalize.mockReset();m.upload.mockReset(); vi.stubGlobal("fetch", m.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function prepare(withPhoto = false) {
  render(<MemoryRouter><HelmetProvider><ObtenirSoumissions /></HelmetProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Excavation Fondation/ }));
  fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Fictif" } });
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
  if (withPhoto) fireEvent.change(screen.getByLabelText("Ajouter des photos"), { target: { files: [new File(["fictif"], "test.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
  fireEvent.change(screen.getByLabelText("Courriel"), { target: { value: "client@test.invalid" } });
  fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
}
describe("soumission existante — envoi entièrement simulé", () => {
  it("ne finalise pas un brouillon sans numéro confirmé", async () => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await prepare();fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.finalize).not.toHaveBeenCalled();
  });
  it("un double clic produit une seule requête et conserve le numéro renvoyé", async () => {
    let finish: (v: unknown) => void = () => {};
    m.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await prepare();const button=screen.getByRole("button", { name: "Envoyer ma demande" });
    fireEvent.click(button);fireEvent.click(button);
    await waitFor(() => expect(m.fetch).toHaveBeenCalledTimes(1));
    await act(async () => { finish({ ok: true, json: async () => ({ ok: true, request_number: "TEST-001" }) }); });
    expect(m.finalize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Numéro de votre demande : TEST-001")).toBeInTheDocument();
  });
  it("une photo refusée empêche l’envoi silencieux sans pièce", async () => {
    m.upload.mockResolvedValue({ error: { message: "Refus TEST" } });
    await prepare(true);fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.fetch).not.toHaveBeenCalled();expect(m.finalize).not.toHaveBeenCalled();
  });
});