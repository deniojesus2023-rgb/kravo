import { META_SCOPES } from './config';
import { expiresAtFrom } from './oauth';
import { MetaApiError, type AdAccountInfo, type Graph } from './graph';

export type ConnectResult =
  | { ok: true; accounts: number; permissions: string[] }
  | { ok: false; reason: 'permissao' | 'meta' | 'salvar' };

export interface ConnectionStore {
  save(input: {
    userId: string;
    accessToken: string;
    expiresAt: string | null;
    metaUserId: string;
    metaUserName: string | null;
    permissions: string[];
    accounts: AdAccountInfo[];
  }): Promise<void>;
}

/**
 * Conclui a conexão depois do retorno do login: troca o código, testa o token com chamadas reais
 * (perfil, permissões, contas de anúncios) e só então grava. Uma conexão nunca fica "conectada"
 * sem ter sido testada. Qualquer falha antes de gravar não deixa nada para trás.
 */
export async function completeMetaConnection(
  deps: { graph: Graph; store: ConnectionStore; now?: () => Date },
  input: { userId: string; code: string; redirectUri: string },
): Promise<ConnectResult> {
  const now = deps.now?.() ?? new Date();
  let long;
  let profile;
  let permissions: string[];
  let accounts: AdAccountInfo[];
  try {
    const short = await deps.graph.exchangeCode(input.code, input.redirectUri);
    long = await deps.graph.toLongLived(short.accessToken);
    [profile, permissions, accounts] = await Promise.all([
      deps.graph.profile(long.accessToken),
      deps.graph.grantedPermissions(long.accessToken),
      deps.graph.adAccounts(long.accessToken),
    ]);
  } catch (error) {
    if (error instanceof MetaApiError) return { ok: false, reason: 'meta' };
    throw error;
  }

  // O usuário pode negar permissões no diálogo: sem ads_read não há o que ler.
  if (!META_SCOPES.every((scope) => permissions.includes(scope))) return { ok: false, reason: 'permissao' };

  try {
    await deps.store.save({
      userId: input.userId,
      accessToken: long.accessToken,
      expiresAt: expiresAtFrom(now, long.expiresInSeconds),
      metaUserId: profile.id,
      metaUserName: profile.name,
      permissions,
      accounts,
    });
  } catch {
    return { ok: false, reason: 'salvar' };
  }
  return { ok: true, accounts: accounts.length, permissions };
}
