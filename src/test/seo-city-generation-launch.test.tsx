import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
} }));
vi.mock("@/lib/auth/sessionToken", () => ({ invokeWithFreshSession: mocks.invoke }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
import { useCityGeneration, type CityRow, type Slot } from "@/lib/seo/useCityGeneration";
const city = { slug: "test", name: "Ville fictive", region: null } as CityRow;
const slots = ["sable", "gravier"].map((m) => ({ kind: "material", material_slug: m, service_slug: null, label: m, state: "missing" })) as Slot[];
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.invoke.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "seo_city_run_start" ? "job-test" : { cities: [], active_run: null }, error: null }));
  mocks.invoke.mockResolvedValue({ data: { created: true }, error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("lancement SEO — réseau entièrement simulé", () => {
  it("un double lancement pendant le démarrage produit un seul job", async () => {
    let release: (v: unknown) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => name === "seo_city_run_start" ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({ data: { cities: [], active_run: null }, error: null }));
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.generate(city, slots.slice(0, 1), "missing");
      await result.current.generate(city, slots.slice(0, 1), "missing");
    });
    expect(mocks.rpc.mock.calls.filter(([n]) => n === "seo_city_run_start")).toHaveLength(1);
    await act(async () => { release({ data: "job-test", error: null }); await first; });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("un démarrage refusé ne lance aucune page et libère le verrou", async () => {
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.rpc.mockImplementation(async (n: string) => ({ data: n === "seo_city_run_start" ? null : { cities: [] }, error: n === "seo_city_run_start" ? { message: "Verrou serveur" } : null }));
    await act(async () => { await expect(result.current.generate(city, slots, "missing")).rejects.toThrow("Verrou serveur"); });
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.rpc.mockImplementation(async (n: string) => ({ data: n === "seo_city_run_start" ? "job-test" : { cities: [] }, error: null }));
    await act(async () => { await result.current.generate(city, slots.slice(0, 1), "missing"); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("un quota fournisseur arrête le lot avant la deuxième page", async () => {
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("429 quota") });
    await act(async () => { await result.current.generate(city, slots, "missing"); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const finish = mocks.rpc.mock.calls.find(([n]) => n === "seo_city_run_finish");
    expect(finish?.[1]).toMatchObject({ _created: 0, _errors: 1 });
  });
  it("une réponse vide n’est pas comptée comme une création", async () => {
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.invoke.mockResolvedValue({ data: null, error: null });
    await act(async () => { await result.current.generate(city, slots.slice(0, 1), "missing"); });
    expect(mocks.rpc.mock.calls.find(([n]) => n === "seo_city_run_finish")?.[1]).toMatchObject({ _created: 0, _errors: 1 });
  });
  it("une régénération confirmée par updated reste un succès", async () => {
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.invoke.mockResolvedValue({ data: { created: false, updated: true }, error: null });
    await act(async () => { await result.current.generate(city, slots.slice(0, 1), "repair"); });
    expect(mocks.rpc.mock.calls.find(([n]) => n === "seo_city_run_finish")?.[1]).toMatchObject({ _created: 1, _errors: 0 });
  });
  it("une progression refusée arrête le traitement avant la page suivante", async () => {
    const { result } = renderHook(() => useCityGeneration());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.rpc.mockImplementation(async (n: string) => ({ data: n === "seo_city_run_start" ? "job-test" : { cities: [] }, error: n === "seo_city_run_progress" ? { message: "Écriture du suivi refusée" } : null }));
    await act(async () => { await result.current.generate(city, slots, "missing"); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});