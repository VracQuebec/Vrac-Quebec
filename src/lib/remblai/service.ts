// Application service independent of its repository. The preview supplies fictional
// memory only. A hosted implementation must supply transactions and protected storage.
import { conditionsSchema, type ReceptionConditions } from "./conditions";
import { publicEditPayload, emptyParcoursDraft, type ParcoursDraft, type PublicEdit } from './public-form';
export type Action = "modifier" | "confirmer" | "pause" | "reprendre" | "fermer";
export type RequestRecord = {
  id: string; reference: string; name: string; city: string; status: string;
  availability: "a_confirmer" | "available" | "suspended" | "owner_closed";
  lastConfirmed: string | null; version: number; conditions: ReceptionConditions;
  publicForm?: ParcoursDraft;
  proposals: { id: string; label: string; status: string }[];
  deliveries: { id: string; label: string; status: string }[];
  operationalState?: string;
  receivedEvidence?: { id: string; date: string; count: number; kind: string }[];
  history: { id: string; action: string; at: string; version: number }[];
};
export type LinkRecord = { id: string; requestId: string; digest: string; expiresAt: number; revoked: boolean; verifiedContact: boolean; verifiedAt: number | null; codeDigest: string | null; codeExpires: number; failures: number };
export interface Repository {
  getLink(id: string): Promise<LinkRecord | null>;
  putLink(link: LinkRecord): Promise<void>;
  getRequest(id: string): Promise<RequestRecord | null>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  putRequest(request: RequestRecord): Promise<void>;
  getResult(id: string): Promise<RequestRecord | null>;
  putResult(id: string, request: RequestRecord): Promise<void>;
}
export class PortalError extends Error {}
// A transport success alone never proves that the exact dossier was saved.
export function assertSavedRequest(result: unknown, requestId: string, version: number): asserts result is Omit<RequestRecord, 'history'> {
  if (!result || typeof result !== 'object') throw new PortalError('Enregistrement non confirmé.');
  const row = result as Partial<RequestRecord>;
  if (row.id !== requestId || !Number.isInteger(row.version) || typeof row.version !== 'number' || row.version <= version || !row.conditions || !Array.isArray(row.proposals) || !Array.isArray(row.deliveries)) throw new PortalError('Enregistrement non confirmé pour cette demande.');
}
export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function randomSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join(""); }
export class RemblaiService {
  constructor(private repo: Repository, private now = () => Date.now()) {}
  private async authorize(linkId: string, secret: string, requestId: string) {
    const link = await this.repo.getLink(linkId);
    if (!link || link.requestId !== requestId || link.revoked || link.expiresAt <= this.now() || link.digest !== await digest(secret)) throw new PortalError("Lien indisponible ou expiré. Demandez un nouveau lien au contact déjà vérifié.");
    return link;
  }
  // Read never updates viewed_at, confirmation, expiry, history or availability.
  async read(linkId: string, secret: string, requestId: string) {
    await this.authorize(linkId, secret, requestId);
    const row = await this.repo.getRequest(requestId);
    if (!row) throw new PortalError("Lien indisponible ou expiré. Demandez un nouveau lien au contact déjà vérifié.");
    const { history: _history, ...publicRow } = row;
    return publicRow;
  }
  // Delivery is injected, never accepts a destination from the requester.
  async requestCode(linkId: string, secret: string, requestId: string, deliver: (link: LinkRecord, code: string) => Promise<void>) {
    await this.repo.transaction(async () => {
      const link = await this.authorize(linkId, secret, requestId);
      if (!link.verifiedContact || link.failures >= 5) throw new PortalError("Contact vérifié requis ou vérification bloquée.");
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      const code = String((random ?? 0) % 1000000).padStart(6, "0");
      await deliver(link, code);
      await this.repo.putLink({ ...link, codeDigest: await digest(`${link.id}:${code}`), codeExpires: this.now() + 10 * 60000, verifiedAt: null });
    });
  }
  async verifyCode(linkId: string, secret: string, requestId: string, code: string) {
    // Failed attempts must commit, not roll back with a thrown error.
    const ok = await this.repo.transaction(async () => {
      const link = await this.authorize(linkId, secret, requestId);
      if (link.failures >= 5 || !link.codeDigest || link.codeExpires <= this.now()) return false;
      if (!/^\d{6}$/.test(code) || link.codeDigest !== await digest(`${link.id}:${code}`)) {
        await this.repo.putLink({ ...link, failures: link.failures + 1 }); return false;
      }
      await this.repo.putLink({ ...link, codeDigest: null, codeExpires: 0, verifiedAt: this.now(), failures: 0 }); return true;
    });
    if (!ok) throw new PortalError("Code invalide, expiré ou vérification bloquée.");
  }
  async act(input: { linkId: string; secret: string; requestId: string; action: Action; confirmed: boolean; operationId: string; version: number; conditions?: ReceptionConditions; publicForm?: PublicEdit }) {
    return this.repo.transaction(async () => {
      const link = await this.authorize(input.linkId, input.secret, input.requestId);
      if (!input.confirmed) throw new PortalError("Confirmation explicite requise.");
      if (link.verifiedAt == null || this.now() - link.verifiedAt > 10 * 60000) throw new PortalError("Vérifiez votre identité par un code récent.");
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.operationId)) throw new PortalError("Opération invalide.");
      const key = `${link.id}:${input.operationId}`;
      const previous = await this.repo.getResult(key);
      if (previous) return previous;
      const row = await this.repo.getRequest(input.requestId);
      if (!row || row.version !== input.version) throw new PortalError("Le dossier a changé. Relisez-le avant de confirmer.");
      if (row.availability === "owner_closed") throw new PortalError("Ce dossier est fermé. Une réouverture doit être validée.");
      if (input.action === "modifier") {
        if (input.publicForm) {
          if (!row.publicForm) throw new PortalError('Les renseignements originaux ne sont pas disponibles.');
          const form = publicEditPayload({...emptyParcoursDraft, ...input.publicForm});
          if (form.email !== row.publicForm.email) throw new PortalError('Le courriel propriétaire est protégé.');
          if (row.publicForm.unavailableFields?.includes('notes') && form.notes !== row.publicForm.notes) throw new PortalError('Les anciennes précisions sont protégées.');
          row.publicForm = {...row.publicForm, ...form, lat: form.address === row.publicForm.address ? row.publicForm.lat : null, lng: form.address === row.publicForm.address ? row.publicForm.lng : null};
          row.name = form.name;
        } else {
        const parsed = conditionsSchema.parse(input.conditions);
        // Owners cannot declare an environmental or project validation themselves.
        if (parsed.environmental !== row.conditions.environmental || parsed.projectFit !== row.conditions.projectFit) throw new PortalError("La validation environnementale et du projet est réservée à l’équipe.");
        row.conditions = parsed;
        }
        row.availability = "a_confirmer"; row.lastConfirmed = null;
      } else if (input.action === "pause") row.availability = "suspended";
      else if (input.action === "reprendre") row.availability = "a_confirmer";
      else if (input.action === "fermer") row.availability = "owner_closed";
      else if (input.action === "confirmer") {
        if (row.availability === "suspended") throw new PortalError("Reprenez d’abord la demande.");
        row.lastConfirmed = new Date(this.now()).toISOString(); row.availability = "available";
      } else throw new PortalError("Action invalide.");
      row.version += 1;
      row.history.push({ id: input.operationId, action: input.action, at: new Date(this.now()).toISOString(), version: row.version });
      // Commercial status, proposals and deliveries remain untouched.
      await this.repo.putRequest(row); await this.repo.putResult(key, row); return row;
    });
  }
  async renew(linkId: string, deliver: (link: LinkRecord, secret: string) => Promise<void>) {
    return this.repo.transaction(async () => {
      const old = await this.repo.getLink(linkId);
      if (!old?.verifiedContact) throw new PortalError("Un contact vérifié est nécessaire.");
      const secret = randomSecret();
      const next = { ...old, id: crypto.randomUUID(), digest: await digest(secret), revoked: false, expiresAt: this.now() + 30 * 86400000, verifiedAt: null, codeDigest: null, failures: 0 };
      // No new bearer secret in API response, it goes only to verified contact.
      await deliver(next, secret);
      await this.repo.putLink({ ...old, revoked: true }); await this.repo.putLink(next);
    });
  }
}