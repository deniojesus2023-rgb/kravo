import { appSecretProof } from './oauth';
import type { MetaEnv } from './config';

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
  ) {
    super(message);
  }
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
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
    if (!response.ok || body.error) {
      throw new MetaApiError(body.error?.message ?? `A Meta respondeu com erro ${response.status}.`, body.error?.code ?? null, response.status);
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
