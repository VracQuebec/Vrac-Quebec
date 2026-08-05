// ============================================================
// VRAC QUÉBEC — JOURNALISATION & MONITORING (partagé edge)
// ------------------------------------------------------------
// Toute erreur, soumission, calcul, appel Google, courriel ou
// appel API est journalisé dans public.platform_logs.
// Les erreurs répétées créent automatiquement une alerte
// dans public.platform_alerts (voir platform_log_event).
// La journalisation ne doit JAMAIS faire échouer une requête.
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/** Sources normalisées : facilite la recherche dans le tableau de bord. */
export type LogSource =
  | 'google_maps'
  | 'quote_engine'
  | 'quote_submit'
  | 'submission'
  | 'email'
  | 'database'
  | 'edge_function'
  | 'api';

export interface LogEntry {
  source: LogSource;
  event: string;
  level?: LogLevel;
  message?: string | null;
  durationMs?: number | null;
  statusCode?: number | null;
  refId?: string | null;
  context?: Record<string, unknown>;
}

const MAX_MESSAGE = 2000;

function endpoint() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

/** Journalise un événement. N'émet jamais d'exception. */
export async function logEvent(entry: LogEntry): Promise<void> {
  const level = entry.level ?? 'info';
  const line = `[${level}] ${entry.source}/${entry.event}${entry.message ? ` — ${entry.message}` : ''}`;
  if (level === 'error' || level === 'critical') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  const env = endpoint();
  if (!env) return;

  try {
    await fetch(`${env.url}/rest/v1/rpc/platform_log_event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
      },
      body: JSON.stringify({
        _source: entry.source,
        _event: entry.event,
        _level: level,
        _message: entry.message ? String(entry.message).slice(0, MAX_MESSAGE) : null,
        _duration_ms: entry.durationMs ?? null,
        _status_code: entry.statusCode ?? null,
        _ref_id: entry.refId ?? null,
        _context: entry.context ?? {},
      }),
    });
  } catch (e) {
    console.error('[observability] journalisation impossible:', e instanceof Error ? e.message : String(e));
  }
}

/** Version « tire et oublie » : à utiliser quand la latence compte. */
export function logEventAsync(entry: LogEntry): void {
  void logEvent(entry);
}

/**
 * Mesure une opération et journalise automatiquement succès / échec.
 * L'erreur d'origine est toujours relancée telle quelle.
 */
export async function tracked<T>(
  source: LogSource,
  event: string,
  fn: () => Promise<T>,
  meta: { refId?: string | null; context?: Record<string, unknown> } = {},
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logEventAsync({
      source, event, level: 'info',
      durationMs: Date.now() - started,
      refId: meta.refId ?? null,
      context: meta.context,
    });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEvent({
      source, event: `${event}.failed`, level: 'error', message,
      durationMs: Date.now() - started,
      refId: meta.refId ?? null,
      context: meta.context,
    });
    throw e;
  }
}
