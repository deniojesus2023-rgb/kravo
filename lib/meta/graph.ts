import { appSecretProof } from './oauth';
import type { MetaEnv } from './config';

export class MetaApiError extends Error {
  readonly type: string | null;
  readonly subcode: number | null;
  readonly fbtraceId: string | null;

  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
    extra: { type?: string | null; subcode?: number | null; fbtraceId?: string | null } = {},
  ) {
    super(message);
    this.type = extra.type ?? null;
    this.subcode = extra.subcode ?? null;
    this.fbtraceId = extra.fbtraceId ?? null;
  }
}

/**
 * Mensagem de erro da Meta, segura para log: tira qualquer valor sensível conhecido (segredo, código,
 * token, passados em `secrets`), qualquer sequência longa que pareça token ou código, e limita o tamanho.
 * A Meta às vezes repete o valor recebido na mensagem (ex.: "Malformed access token …").
 */
export function redactMessage(message: string, secrets: string[]): string {
  let out = message;
  for (const secret of secrets) if (secret.length >= 8) out = out.split(secret).join('[redigido]');
  out = out.replace(/[A-Za-z0-9_|.\-]{24,}/g, '[redigido]');
  return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}

export interface AdAccountInfo {
  id: string; // act_123
  name: string;
  currency: string | null;
  timezoneName: string | null;
  accountStatus: number | null;
  businessName: string | null;
}

export interface TokenInfo {
  accessToken: string;
  expiresInSeconds: number | undefined;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Cliente mínimo da Graph API. `fetch` é injetável (testes). Nenhuma mensagem de erro inclui URL,
 * token ou segredo: só o código e o texto que a Meta devolve.
 */
export function createGraph(env: MetaEnv, fetcher: FetchLike = fetch as FetchLike) {
  const base = `https://graph.facebook.com/${env.graphVersion}`;

  async function call<T>(path: string, params: Record<string, string>, token?: string): Promise<T> {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (token) {
      url.searchParams.set('access_token', token);
      url.searchParams.set('appsecret_proof', appSecretProof(token, env.appSecret));
    }
    let response: Response;
    try {
      response = await fetcher(url.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new MetaApiError('Não foi possível falar com a Meta agora.', null, 0);
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string };
    } & T;
    if (!response.ok || body.error) {
      // Só campos escolhidos do erro; o corpo bruto da resposta nunca vai adiante.
      const e = body.error;
      const sensitive = [env.appSecret, token ?? '', ...Object.values(params)];
      throw new MetaApiError(
        e?.message ? redactMessage(String(e.message), sensitive) : `A Meta respondeu com erro ${response.status}.`,
        typeof e?.code === 'number' ? e.code : null,
        response.status,
        {
          type: typeof e?.type === 'string' && /^[A-Za-z]{3,40}$/.test(e.type) ? e.type : null,
          subcode: typeof e?.error_subcode === 'number' ? e.error_subcode : null,
          fbtraceId: typeof e?.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(e.fbtrace_id) ? e.fbtrace_id : null,
        },
      );
    }
    return body;
  }

  const tokenOf = (r: { access_token?: string; expires_in?: number }): TokenInfo => {
    if (!r.access_token) throw new MetaApiError('A Meta não devolveu um token.', null, 200);
    return { accessToken: r.access_token, expiresInSeconds: r.expires_in };
  };

  return {
    /** Código do login → token de curta duração. */
    async exchangeCode(code: string, redirectUri: string): Promise<TokenInfo> {
      return tokenOf(
        await call('/oauth/access_token', { client_id: env.appId, client_secret: env.appSecret, redirect_uri: redirectUri, code }),
      );
    },

    /** Token de curta duração → token de longa duração (cerca de 60 dias). */
    async toLongLived(shortToken: string): Promise<TokenInfo> {
      return tokenOf(
        await call('/oauth/access_token', {
          grant_type: 'fb_exchange_token',
          client_id: env.appId,
          client_secret: env.appSecret,
          fb_exchange_token: shortToken,
        }),
      );
    },

    /**
     * Sonda de diagnóstico: o par ID + chave secreta do app é válido? Usa o token de app (client_credentials),
     * que é descartado: só o resultado (verdadeiro, falso ou indeterminado) sai daqui.
     */
    async checkAppCredentials(): Promise<boolean | null> {
      try {
        await call('/oauth/access_token', { client_id: env.appId, client_secret: env.appSecret, grant_type: 'client_credentials' });
        return true;
      } catch (error) {
        if (error instanceof MetaApiError && error.status >= 400 && error.status < 500 && [1, 100, 101, 190, 200].includes(error.code ?? -1)) {
          return false;
        }
        return null;
      }
    },

    async profile(token: string): Promise<{ id: string; name: string | null }> {
      const r = await call<{ id: string; name?: string }>('/me', { fields: 'id,name' }, token);
      return { id: r.id, name: r.name ?? null };
    },

    /** Permissões efetivamente concedidas (o usuário pode negar algumas). */
    async grantedPermissions(token: string): Promise<string[]> {
      const r = await call<{ data?: Array<{ permission: string; status: string }> }>('/me/permissions', {}, token);
      return (r.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission);
    },

    async adAccounts(token: string): Promise<AdAccountInfo[]> {
      const out: AdAccountInfo[] = [];
      let params: Record<string, string> | null = {
        fields: 'account_id,name,currency,timezone_name,account_status,business{name}',
        limit: '100',
      };
      let path = '/me/adaccounts';
      let guard = 0;
      while (params && guard++ < 20) {
        const r: { data?: Array<Record<string, any>>; paging?: { cursors?: { after?: string }; next?: string } } = await call(path, params, token);
        for (const a of r.data ?? []) {
          out.push({
            id: String(a.id ?? `act_${a.account_id}`),
            name: String(a.name ?? a.account_id ?? 'Conta de anúncios'),
            currency: a.currency ?? null,
            timezoneName: a.timezone_name ?? null,
            accountStatus: typeof a.account_status === 'number' ? a.account_status : null,
            businessName: a.business?.name ?? null,
          });
        }
        const after = r.paging?.next ? r.paging.cursors?.after : undefined;
        params = after ? { ...params, after } : null;
      }
      return out;
    },

    /** Revoga as permissões do app no Facebook (usado ao desconectar). */
    async revoke(token: string): Promise<void> {
      const url = new URL(`${base}/me/permissions`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('appsecret_proof', appSecretProof(token, env.appSecret));
      try {
        await (fetcher as (u: string, i: { method: string; signal: AbortSignal }) => Promise<Response>)(url.toString(), {
          method: 'DELETE',
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // Revogar é um esforço extra: a kavro apaga o token de qualquer jeito.
      }
    },
  };
}

export type Graph = ReturnType<typeof createGraph>;
