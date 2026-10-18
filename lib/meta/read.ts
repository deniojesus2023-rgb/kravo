import type { SupabaseClient } from '@supabase/supabase-js';
import { daysLeft, deriveConnectionStatus } from './oauth';

export interface MetaIntegration {
  status: 'nao_conectado' | 'conectado' | 'expirando' | 'desconectado';
  userName: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  permissions: string[];
  accounts: Array<{
    id: string;
    metaAccountId: string;
    name: string;
    businessManager: string | null;
    currency: string | null;
    selected: boolean;
  }>;
}

/** Lê a conexão do usuário (RLS: só as linhas dele). Não toca em credenciais, que o navegador nem consegue ler. */
export async function readMetaIntegration(supabase: SupabaseClient, now = new Date()): Promise<MetaIntegration> {
  const conn = await supabase
    .from('meta_connections')
    .select('id, status, meta_user_name, granted_permissions, expires_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (conn.error) throw new Error(`Falha ao ler meta_connections: ${conn.error.message}`);
  const row = conn.data?.[0];
  if (!row) return { status: 'nao_conectado', userName: null, expiresAt: null, daysLeft: null, permissions: [], accounts: [] };

  const accounts = await supabase
    .from('ad_accounts')
    .select('id, meta_account_id, name, business_manager, currency, selected')
    .eq('meta_connection_id', row.id)
    .order('name');
  if (accounts.error) throw new Error(`Falha ao ler ad_accounts: ${accounts.error.message}`);

  return {
    status: deriveConnectionStatus(row, now),
    userName: row.meta_user_name,
    expiresAt: row.expires_at,
    daysLeft: row.expires_at ? daysLeft(row.expires_at, now) : null,
    permissions: row.granted_permissions ?? [],
    accounts: (accounts.data ?? []).map((a) => ({
      id: a.id,
      metaAccountId: a.meta_account_id,
      name: a.name,
      businessManager: a.business_manager,
      currency: a.currency,
      selected: a.selected,
    })),
  };
}
