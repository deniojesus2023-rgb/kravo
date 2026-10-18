/**
 * Configuração pública do Supabase. Só a URL e a chave publicável (feitas para o navegador).
 * A chave secreta (service_role) nunca entra aqui nem em NEXT_PUBLIC_*.
 * Sem as duas variáveis a autenticação fica desligada e o app roda só com os dados de exemplo.
 */
export function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export const isAuthConfigured = () => getSupabaseEnv() !== null;
