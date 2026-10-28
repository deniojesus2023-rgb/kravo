/** Configuração do chat a partir do ambiente. A chave nunca sai de `chatConfig`, que só o servidor usa. */

export const DEFAULT_DAILY_LIMIT = 50;
export const MAX_DAILY_LIMIT = 1000;

type Env = Record<string, string | undefined>;

export function dailyLimit(env: Env = process.env): number {
  const n = Number(env.ALFRED_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_DAILY_LIMIT) : DEFAULT_DAILY_LIMIT;
}

/** Chave, modelo e limite, ou `null` se faltar a chave ou o modelo (o chat então fica desativado). */
export function chatConfig(env: Env = process.env): { apiKey: string; model: string; dailyLimit: number } | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.ALFRED_MODEL?.trim();
  if (!apiKey || !model) return null;
  return { apiKey, model, dailyLimit: dailyLimit(env) };
}

export type ChatUnavailable = 'sem_banco' | 'sem_login' | 'sem_chave' | 'sem_modelo';

/** O chat funciona quando há banco, sessão, chave e modelo. Não expõe nenhum valor secreto. */
export function chatStatus(opts: { supabase: boolean; signedIn: boolean; env?: Env }): { available: true; model: string; dailyLimit: number } | { available: false; reason: ChatUnavailable } {
  const env = opts.env ?? process.env;
  if (!opts.supabase) return { available: false, reason: 'sem_banco' };
  if (!opts.signedIn) return { available: false, reason: 'sem_login' };
  if (!env.OPENAI_API_KEY?.trim()) return { available: false, reason: 'sem_chave' };
  const model = env.ALFRED_MODEL?.trim();
  if (!model) return { available: false, reason: 'sem_modelo' };
  return { available: true, model, dailyLimit: dailyLimit(env) };
}

export const UNAVAILABLE_TEXT: Record<ChatUnavailable, string> = {
  sem_banco: 'O Alfred precisa da conta e do banco configurados neste ambiente, então o envio está desativado.',
  sem_login: 'Entre na sua conta para conversar com o Alfred.',
  sem_chave: 'O Alfred ainda não está conectado a um modelo de IA (falta a chave do provedor no ambiente), então o envio está desativado.',
  sem_modelo: 'O Alfred ainda não tem um modelo escolhido (falta definir ALFRED_MODEL no ambiente), então o envio está desativado.',
};
