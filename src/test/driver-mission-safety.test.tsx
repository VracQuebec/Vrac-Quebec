import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), watch: vi.fn(), clear: vi.fn(), user: { id: "driver-test" } as { id: string } | null, success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuthReady", () => ({ useAuthReady: () => ({ isReady: true, user: mocks.user }) }));
vi.mock("@/components/layout/PageHeader", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (table: string) => { const q = { select: () => q, eq: () => q, is: () => q, maybeSingle: () => mocks.read(table), order: () => Promise.resolve({ data: [], error: null }) }; return q; },
} }));
import DriverMission from "@/pages/DriverMission";
beforeEach(() => {
  mocks.user = { id: "driver-test" };
  mocks.rpc.mockReset(); mocks.read.mockReset(); mocks.watch.mockReset(); mocks.clear.mockReset(); mocks.success.mockReset(); mocks.error.mockReset();
  mocks.watch.mockReturnValue(42);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: mocks.watch, clearWatch: mocks.clear } });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  mocks.read.mockResolvedValue({ data: { id: "mission-test", ended_at: null }, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => cleanup());
describe("mission chauffeur — aucune localisation ni écriture réelle", () => {
  it("ne reprend pas la géolocalisation par la seule ouverture", async () => {
    render(<DriverMission />);
    await screen.findByRole("button", { name: "Autoriser et reprendre le suivi" });
    expect(mocks.watch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Autoriser et reprendre le suivi" }));
    expect(mocks.watch).toHaveBeenCalledTimes(1);
  });
  it("arrête le suivi lorsque la page est cachée et ne le reprend pas automatiquement", async () => {
    render(<DriverMission />);
    fireEvent.click(await screen.findByRole("button", { name: "Autoriser et reprendre le suivi" }));
    await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.clear).toHaveBeenCalledWith(42);
    await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.watch).toHaveBeenCalledTimes(1);
  });
  it("une fin refusée conserve la mission et ne montre aucun succès", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Erreur réseau" } });
    render(<DriverMission />);
    fireEvent.click(await screen.findByRole("button", { name: "Terminer la mission" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Erreur réseau"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Terminer la mission" })).toBeInTheDocument();
  });
  it("un retour RPC sans clôture relue ne vaut pas une mission terminée", async () => {
    render(<DriverMission />);
    fireEvent.click(await screen.findByRole("button", { name: "Terminer la mission" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("la déconnexion arrête la collecte locale", async () => {
    const view = render(<MemoryRouter><DriverMission /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Autoriser et reprendre le suivi" }));
    mocks.user = null;
    view.rerender(<MemoryRouter><DriverMission /></MemoryRouter>);
    expect(mocks.clear).toHaveBeenCalledWith(42);
  });
  it("une lecture échouée ne propose pas de démarrer une nouvelle mission", async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: "Lecture refusée" } });
    render(<DriverMission />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Démarrer la mission" })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});