const OUTBOX = "vq.rds.outbox";
export function outboxGet(): any[] { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } }
export function outboxAdd(p: any) { const q = outboxGet().filter((x) => x.client_key !== p.client_key); q.push(p); localStorage.setItem(OUTBOX, JSON.stringify(q)); }
let flushing = false;
export async function outboxFlush(db: any): Promise<{ sent: number; refused: string[] }> {
  if (flushing || !navigator.onLine) return { sent: 0, refused: [] };
  flushing = true; let sent = 0; const refused: string[] = [];
  try {
    for (const p of outboxGet()) {
      const { error } = await db.rpc("rds_submit", { p: { ...p, offline: true } });
      if (error && /fetch|network/i.test(error.message)) break; // réseau encore instable : on réessaiera
      const left = outboxGet().filter((x) => x.client_key !== p.client_key);
      if (error) { refused.push(error.message); localStorage.setItem(`${OUTBOX}.refused.${p.client_key}`, JSON.stringify(p)); } else sent++;
      localStorage.setItem(OUTBOX, JSON.stringify(left));
    }
  } finally { flushing = false; }
  return { sent, refused };
}

/** Envoi global : dès le retour du réseau, peu importe la page ouverte. */
export function startRdsOutbox(db: any) {
  const go = () => { if (outboxGet().length) void outboxFlush(db).then((r) => { if (r.sent) window.dispatchEvent(new CustomEvent("rds-outbox-sent", { detail: r })); }); };
  window.addEventListener("online", go); window.setInterval(() => navigator.onLine && go(), 30000); go();
}
