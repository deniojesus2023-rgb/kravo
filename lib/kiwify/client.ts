/**
 * Cliente mínimo da API pública da Kiwify (https://docs.kiwify.com.br). `fetch` é injetável (testes).
 * Nenhuma mensagem de erro inclui URL, token ou segredo: só o status e o código/mensagem curta da Kiwify.
 */

export const KIWIFY_BASE = 'https://public-api.kiwify.com/v1';

/** Eventos que a trakfy escuta. O webhook só avisa; os dados vêm de `GET /sales`. */
export const WEBHOOK_TRIGGERS = ['compra_aprovada', 'pix_gerado', 'boleto_gerado', 'compra_reembolsada', 'chargeback', 'subscription_renewed'] as const;

export class KiwifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

export interface KiwifyCredentials {
  clientId: string;
  clientSecret: string;
  accountId: string;
}

export interface KiwifyProduct {
  id: string;
  name: string;
  currency?: string | null;
  status?: string | null;
}

/** Venda como a API devolve (com `view_full_sale_details=true`). Só os campos que a trakfy usa. */
export interface KiwifySale {
  id?: string;
  reference?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  approved_date?: string | null;
  refunded_at?: string | null;
  payment_method?: string;
  product?: { id?: string; name?: string };
  payment?: { charge_amount?: number; charge_currency?: string; net_amount?: number; fee?: number };
  tracking?: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term', string | null>>;
}

interface Page<T> {
  data?: T[];
  pagination?: { count?: number; page_number?: number; page_size?: number };
}

const safeText = (value: unknown, max = 120) => (typeof value === 'string' ? value.replace(/[^\w .:,\-()áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/g, '').slice(0, max) : '');

export function createKiwify(fetcher: FetchLike = fetch as FetchLike) {
  async function call<T>(
    path: string,
    opts: { method?: string; query?: Record<string, string>; json?: unknown; form?: Record<string, string>; token?: string; accountId?: string } = {},
  ): Promise<T> {
    const url = new URL(`${KIWIFY_BASE}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.accountId) headers['x-kiwify-account-id'] = opts.accountId;
    let body: string | undefined;
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(opts.form).toString();
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }
    let response: Response;
    try {
      response = await fetcher(url.toString(), { method: opts.method ?? 'GET', headers, body, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new KiwifyApiError('Não foi possível falar com a Kiwify agora.', 0);
    }
    const parsed = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown } & T;
    if (!response.ok) {
      const code = typeof parsed.error === 'string' && /^[a-z_]{3,40}$/.test(parsed.error) ? parsed.error : null;
      throw new KiwifyApiError(safeText(parsed.message) || `A Kiwify respondeu com erro ${response.status}.`, response.status, code);
    }
    return parsed;
  }

  async function pages<T>(path: string, auth: { token: string; accountId: string }, query: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    const size = 100;
    for (let n = 1; n <= 200; n += 1) {
      const r = await call<Page<T>>(path, { ...auth, query: { ...query, page_size: String(size), page_number: String(n) } });
      const list = r.data ?? [];
      out.push(...list);
      if (list.length < size) break;
    }
    return out;
  }

  return {
    /** `client_id` + `client_secret` → token Bearer (vale 24 h). */
    async token(clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
      const r = await call<{ access_token?: string; expires_in?: number | string }>('/oauth/token', {
        method: 'POST',
        form: { client_id: clientId, client_secret: clientSecret },
      });
      if (!r.access_token) throw new KiwifyApiError('A Kiwify não devolveu um token.', 200);
      return { accessToken: r.access_token, expiresInSeconds: Number(r.expires_in) || 86_400 };
    },

    products(auth: { token: string; accountId: string }): Promise<KiwifyProduct[]> {
      return pages<KiwifyProduct>('/products', auth, {});
    },

    /** Vendas de `start` a `end` (YYYY-MM-DD, no máximo 90 dias). `updatedSince` restringe às alteradas depois. */
    sales(auth: { token: string; accountId: string }, start: string, end: string, updatedSince?: string): Promise<KiwifySale[]> {
      return pages<KiwifySale>('/sales', auth, {
        start_date: start,
        end_date: end,
        view_full_sale_details: 'true',
        ...(updatedSince ? { updated_at_start_date: updatedSince, updated_at_end_date: end } : {}),
      });
    },

    async createWebhook(auth: { token: string; accountId: string }, input: { name: string; url: string; token: string }): Promise<{ id: string }> {
      const r = await call<{ id?: string }>('/webhooks', {
        ...auth,
        method: 'POST',
        json: { name: input.name, url: input.url, products: 'all', triggers: [...WEBHOOK_TRIGGERS], token: input.token },
      });
      if (!r.id) throw new KiwifyApiError('A Kiwify não confirmou a criação do webhook.', 200);
      return { id: String(r.id) };
    },

    async deleteWebhook(auth: { token: string; accountId: string }, id: string): Promise<void> {
      await call(`/webhooks/${encodeURIComponent(id)}`, { ...auth, method: 'DELETE' });
    },
  };
}

export type Kiwify = ReturnType<typeof createKiwify>;
