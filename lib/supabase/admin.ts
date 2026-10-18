import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

/**
 * Cliente com a chave de serviço (ignora a RLS). Só no servidor, só para o que o navegador não pode
 * fazer: gravar conexões, credenciais cifradas e métricas. Quem chama é responsável por usar o
 * user_id verificado da sessão. Devolve `null` sem a chave.
 */
export function createAdminClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
