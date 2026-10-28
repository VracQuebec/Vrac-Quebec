export type FileProgress = { received: number; total: number | null };

/** Lecture progressive sans copie intermédiaire du document ni conservation après la requête. */
export async function readFileResponse(response: Response, onProgress?: (progress: FileProgress) => void): Promise<Blob> {
  if (!onProgress || !response.body) return response.blob();
  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  onProgress({ received, total });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      received += value.byteLength;
      onProgress({ received, total });
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks, { type: response.headers.get("content-type") ?? "application/octet-stream" });
}

export function fileProgressLabel(progress: FileProgress): string {
  const received = (progress.received / 1048576).toFixed(1);
  return progress.total ? `${received} / ${(progress.total / 1048576).toFixed(1)} Mo` : `${received} Mo reçus`;
}