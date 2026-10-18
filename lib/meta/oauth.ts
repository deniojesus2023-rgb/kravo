import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { META_SCOPES, type MetaEnv } from './config';

export const STATE_COOKIE = 'kavro_meta_state';
export const STATE_MAX_AGE_SECONDS = 600;

/** Valor aleatório contra falsificação de requisição (CSRF): vai no cookie e na URL do login. */
export const newState = () => randomBytes(24).toString('base64url');

export function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** URL do diálogo de login da Meta. Com configuração de login usa config_id; senão, o escopo ads_read. */
export function buildLoginUrl(env: MetaEnv, redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${env.graphVersion}/dialog/oauth`);
  url.searchParams.set('client_id', env.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (env.configId) url.searchParams.set('config_id', env.configId);
  else url.searchParams.set('scope', META_SCOPES.join(','));
  return url.toString();
}

/** Prova de que a chamada vem do servidor do app (exigida quando "Exigir prova do segredo do app" está ligado). */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

export const expiresAtFrom = (now: Date, expiresInSeconds: number | undefined): string | null =>
  typeof expiresInSeconds === 'number' && expiresInSeconds > 0
    ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString()
    : null;

/** Estado de uma conexão na interface. Expira em breve = menos de 7 dias; passou da data = desconectado. */
export function deriveConnectionStatus(
  row: { status: string; expires_at: string | null } | null,
  now: Date,
): 'nao_conectado' | 'conectado' | 'expirando' | 'desconectado' {
  if (!row) return 'nao_conectado';
  if (row.status === 'desconectado') return 'desconectado';
  if (row.expires_at) {
    const left = new Date(row.expires_at).getTime() - now.getTime();
    if (left <= 0) return 'desconectado';
    if (left < 7 * 24 * 3600 * 1000) return 'expirando';
  }
  return row.status === 'expirando' ? 'expirando' : 'conectado';
}

export const daysLeft = (expiresAt: string, now: Date) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 3600 * 1000)));
