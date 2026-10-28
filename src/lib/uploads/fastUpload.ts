// Accélération des envois de photos : compression des FUTURES photos côté navigateur
// (originaux existants intouchés), envois parallèles limités, reprise automatique
// et progression visible. Les droits restent vérifiés par le stockage (RLS).

export const PHOTO_MAX_EDGE = 2560; // lisibilité des preuves conservée (≈ 5 Mpx)
export const PHOTO_QUALITY = 0.85;
export const COMPRESS_MIN_BYTES = 600_000;

const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function targetSize(w: number, h: number, maxEdge = PHOTO_MAX_EDGE) {
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { w, h };
  const r = maxEdge / edge;
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

/** Réduit une photo de téléphone; renvoie l'original si la compression n'apporte rien ou échoue. */
export async function preparePhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type) || file.size < COMPRESS_MIN_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const { w, h } = targetSize(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 600): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i)); }
  }
  throw last;
}

/** Exécute les envois avec au plus `limit` en parallèle; conserve l'ordre des résultats. */
export async function runLimited<T, R>(items: T[], limit: number, worker: (item: T, i: number) => Promise<R>, onDone?: (done: number, total: number) => void): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0, done = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: "fulfilled", value: await worker(items[i], i) }; }
      catch (reason) { out[i] = { status: "rejected", reason }; }
      onDone?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

type Bucket = { upload: (p: string, f: File, o?: Record<string, unknown>) => Promise<{ error: unknown }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } };

/** Envoi rapide de photos vers lead-photos : compression, 3 en parallèle, 3 essais. */
export async function uploadLeadPhotos(bucket: Bucket, files: File[], onProgress?: (done: number, total: number) => void) {
  const results = await runLimited(files, 3, async (file) => {
    const prepared = await preparePhoto(file);
    const ext = (prepared.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `submissions/${crypto.randomUUID()}/${Date.now()}.${ext}`;
    await withRetry(async () => { const { error } = await bucket.upload(path, prepared, { contentType: prepared.type, cacheControl: "31536000" }); if (error) throw error; });
    return bucket.getPublicUrl(path).data.publicUrl;
  }, onProgress);
  const urls = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return { urls, failed: results.length - urls.length };
}
