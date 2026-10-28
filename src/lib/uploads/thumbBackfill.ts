// Miniatures des anciennes photos CRM : créées progressivement depuis le navigateur
// d'un membre autorisé, avec les mêmes contrôles (téléchargement de l'original et dépôt
// sous les règles d'accès existantes). L'original n'est jamais modifié ni remplacé.
// Reprise sans doublon : chemin déterministe par fichier + mise à jour seulement si vide.

export type LegacyFile = { id: string; storage_path: string; mime_type: string; thumb_path: string | null };

export type BackfillDeps = {
  download: (path: string) => Promise<Blob | null>;
  makeThumb: (file: File) => Promise<Blob | null>;
  /** Doit refuser l'écrasement; renvoie "exists" si l'objet est déjà présent. */
  upload: (path: string, blob: Blob) => Promise<"ok" | "exists" | "error">;
  /** Met à jour uniquement si thumb_path est encore vide; renvoie true si appliqué. */
  setThumb: (id: string, path: string) => Promise<boolean>;
};

export function legacyThumbPath(companyId: string, fileId: string): string {
  return `company/${companyId}/thumbs/legacy-${fileId}.jpg`;
}

export function needsThumb(f: LegacyFile): boolean {
  return !f.thumb_path && /^image\/(jpeg|png|webp)$/.test(f.mime_type);
}

export type BackfillResult = { created: number; reused: number; skipped: number; failed: number };

/** Traite au plus `max` fichiers, un à la fois (pas de surcharge du téléphone ni du réseau). */
export async function backfillThumbs(companyId: string, files: LegacyFile[], deps: BackfillDeps, max = 10,
  onProgress?: (done: number, total: number) => void): Promise<BackfillResult> {
  const todo = files.filter(needsThumb).slice(0, max);
  const r: BackfillResult = { created: 0, reused: 0, skipped: files.length - todo.length, failed: 0 };
  let done = 0;
  for (const f of todo) {
    try {
      const path = legacyThumbPath(companyId, f.id);
      const original = await deps.download(f.storage_path);
      const thumb = original ? await deps.makeThumb(new File([original], "x.jpg", { type: f.mime_type })) : null;
      const up = thumb ? await deps.upload(path, thumb) : "error";
      if (up === "error") { r.failed++; continue; }
      const applied = await deps.setThumb(f.id, path);
      if (up === "exists" || !applied) r.reused++; else r.created++;
    } catch {
      r.failed++;
    } finally {
      onProgress?.(++done, todo.length);
    }
  }
  return r;
}
