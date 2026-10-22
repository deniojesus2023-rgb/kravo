import { redactMessage } from '@/lib/meta/graph';
import type { CapiEvent } from './event';

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

export class CapiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
    readonly fbtraceId: string | null = null,
  ) {
    super(message);
  }
}

/** token_invalido: parar e avisar. limite e temporario: tentar de novo depois. dados_invalidos: não adianta repetir. */
export type CapiErrorKind = 'token_invalido' | 'limite' | 'temporario' | 'dados_invalidos';

export function capiErrorKind(error: unknown): CapiErrorKind {
  if (!(error instanceof CapiError)) return 'temporario';
  const code = error.code;
  if (code === 190 || code === 102 || code === 104 || (code !== null && code >= 200 && code <= 299)) return 'token_invalido';
  if (code !== null && [4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014].includes(code)) return 'limite';
  if (error.status === 0 || error.status >= 500) return 'temporario';
  return 'dados_invalidos';
}

export interface SendResult {
  eventsReceived: number;
  fbtraceId: string | null;
}

/**
 * Envia eventos ao pixel (`POST /{pixel_id}/events`). O token vai no corpo, nunca na URL nem em mensagem de erro.
 * Com `testEventCode`, os eventos só aparecem em "Eventos de teste" e não entram na otimização.
 */
export function createCapi(fetcher: FetchLike = fetch as FetchLike, graphVersion = process.env.META_GRAPH_VERSION?.trim() || 'v23.0') {
  return {
    async sendEvents(opts: { pixelId: string; token: string; events: CapiEvent[]; testEventCode?: string | null }): Promise<SendResult> {
      const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(opts.pixelId)}/events`;
      let response: Response;
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: opts.events,
            access_token: opts.token,
            ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}),
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new CapiError('Não foi possível falar com o Meta agora.', null, 0);
      }
      const body = (await response.json().catch(() => ({}))) as {
        events_received?: number;
        fbtrace_id?: string;
        error?: { message?: string; code?: number; fbtrace_id?: string };
      };
      if (!response.ok || body.error) {
        const e = body.error;
        throw new CapiError(
          e?.message ? redactMessage(String(e.message), [opts.token]) : `O Meta respondeu com erro ${response.status}.`,
          typeof e?.code === 'number' ? e.code : null,
          response.status,
          typeof (e?.fbtrace_id ?? body.fbtrace_id) === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(String(e?.fbtrace_id ?? body.fbtrace_id)) ? String(e?.fbtrace_id ?? body.fbtrace_id) : null,
        );
      }
      return { eventsReceived: Number(body.events_received ?? 0), fbtraceId: typeof body.fbtrace_id === 'string' ? body.fbtrace_id : null };
    },
  };
}

export type Capi = ReturnType<typeof createCapi>;
