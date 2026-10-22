import { unknownConditions } from "./conditions";
import { emptyParcoursDraft } from './public-form';
import { digest, randomSecret, RemblaiService, type LinkRecord, type Repository, type RequestRecord } from "./service";
const KEY = "vq.exec01.fictional.v1";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const FICTIONAL_ID = "exec01-fictional-request";
export const PREVIEW_EVENT = "vq-exec01-change";
export function fictionalRequest(legacy = false): RequestRecord {
  const conditions = unknownConditions();
  if (!legacy) { conditions.total = 1000; conditions.remaining = 750; conditions.unit = "m3"; conditions.materials[0] = { name: "Terre", stance: "accepte" }; }
  return { id: FICTIONAL_ID, reference: "Demande TEST-01", name: "Camille Exemple", city: "Québec", status: "En attente", availability: "a_confirmer", lastConfirmed: null, version: 1, conditions, publicForm: {...emptyParcoursDraft, address:'123 rue Fictive, Québec', postalCode:'G1A 1A1', quantityValue:'3', projectUsage:'Remplir un terrain', materials:['Terre'], accessHeavyTruck:'oui', accessDetails:['sol_mou'], name:'Camille Exemple', phone:'4185550101', email:'camille@test.invalid', notes:'Entrée côté nord'}, proposals: [], deliveries: [], history: [] };
}
// Never imports the hosted client, never reads/writes production. This repository
// is NOT a security boundary and cannot be used for real anonymous access.
class PreviewRepository implements Repository {
  private links = new Map<string, LinkRecord>();
  private results = new Map<string, RequestRecord>();
  private queue: Promise<unknown> = Promise.resolve();
  private row = fictionalRequest();
  constructor() { try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved?.id === FICTIONAL_ID) this.row = saved; } catch { /* fictional reset */ } }
  async getLink(id: string) { return clone(this.links.get(id) ?? null); }
  async putLink(link: LinkRecord) { this.links.set(link.id, clone(link)); }
  async getRequest(id: string) {
    if (id !== FICTIONAL_ID) return null;
    try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved?.id === FICTIONAL_ID) this.row = saved; } catch { /* ignore */ }
    return clone(this.row);
  }
  async putRequest(row: RequestRecord) { this.row = clone(row); localStorage.setItem(KEY, JSON.stringify(row)); window.dispatchEvent(new Event(PREVIEW_EVENT)); }
  async getResult(id: string) { return clone(this.results.get(id) ?? null); }
  async putResult(id: string, row: RequestRecord) { this.results.set(id, clone(row)); }
  transaction<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work); this.queue = next.catch(() => undefined); return next;
  }
  async reset(legacy: boolean) { this.links.clear(); this.results.clear(); await this.putRequest(fictionalRequest(legacy)); }
}
export const previewRepository = new PreviewRepository();
export const previewService = new RemblaiService(previewRepository);
export type PreviewSession = { linkId: string; secret: string; requestId: string };
let session: PreviewSession | null = null;
let sessionScenario = "";
export async function startPreview(scenario: string): Promise<PreviewSession> {
  if (session && scenario === sessionScenario) return session;
  if (scenario === "ancien") {
    const old = fictionalRequest(true);
    localStorage.setItem(KEY, JSON.stringify(old));
  }
  const secret = randomSecret(); const linkId = crypto.randomUUID();
  await previewRepository.putLink({ id: linkId, requestId: FICTIONAL_ID, digest: await digest(secret), expiresAt: scenario === "expire" ? 0 : Date.now() + 30 * 86400000, revoked: scenario === "revoque", verifiedContact: true, verifiedAt: null, codeDigest: null, codeExpires: 0, failures: 0 });
  sessionScenario = scenario;
  session = { linkId, secret, requestId: scenario === "autre-dossier" ? "inaccessible" : FICTIONAL_ID }; return session;
}
export async function resetPreview(legacy = false) { session = null; sessionScenario = ""; await previewRepository.reset(legacy); }