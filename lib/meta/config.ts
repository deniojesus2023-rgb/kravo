/** Configuração do app da Meta (servidor). A chave secreta nunca vai para o navegador. */

export interface MetaEnv {
  appId: string;
  appSecret: string;
  /** ID da configuração do Login do Facebook para Empresas. Sem ele, o login pede o escopo direto. */
  configId: string | null;
  graphVersion: string;
}

/** Só a leitura de métricas: a trakfy não cria, edita nem pausa anúncios. */
export const META_SCOPES = ['ads_read'] as const;

export function getMetaEnv(): MetaEnv | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    configId: process.env.META_LOGIN_CONFIG_ID?.trim() || null,
    graphVersion: process.env.META_GRAPH_VERSION?.trim() || 'v23.0',
  };
}

/** Endereço público do app. APP_URL, quando definido, vale mais que o cabeçalho Host (que o cliente controla). */
export function appOrigin(request: { nextUrl: { origin: string } }): string {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, '');
  return fixed || request.nextUrl.origin;
}

export const metaRedirectUri = (origin: string) => `${origin}/api/meta/callback`;
