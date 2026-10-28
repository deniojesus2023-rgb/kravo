/** Configuração do chat a partir do ambiente. A chave nunca sai de `chatConfig`, que só o servidor usa. */

import { isValidModelId } from './model';

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
  if (!apiKey || !model || !isValidModelId(model)) return null;
  return { apiKey, model, dailyLimit: dailyLimit(env) };
}

export type ChatUnavailable = 'sem_banco' | 'sem_login' | 'sem_chave' | 'sem_modelo' | 'modelo_mal_escrito';

/** O chat funciona quando há banco, sessão, chave e modelo. Não expõe nenhum valor secreto. */
export function chatStatus(opts: { supabase: boolean; signedIn: boolean; env?: Env }): { available: true; model: string; dailyLimit: number } | { available: false; reason: ChatUnavailable } {
  const env = opts.env ?? process.env;
  if (!opts.supabase) return { available: false, reason: 'sem_banco' };
  if (!opts.signedIn) return { available: false, reason: 'sem_login' };
  if (!env.OPENAI_API_KEY?.trim()) return { available: false, reason: 'sem_chave' };
  const model = env.ALFRED_MODEL?.trim();
  if (!model) return { available: false, reason: 'sem_modelo' };
  if (!isValidModelId(model)) return { available: false, reason: 'modelo_mal_escrito' };
  return { available: true, model, dailyLimit: dailyLimit(env) };
}

export const UNAVAILABLE_TEXT: Record<ChatUnavailable, string> = {
  sem_banco: 'O Alfred precisa da conta e do banco configurados neste ambiente, então o envio está desativado.',
  sem_login: 'Entre na sua conta para conversar com o Alfred.',
  sem_chave: 'O Alfred ainda não está conectado a um modelo de IA (falta a chave do provedor no ambiente), então o envio está desativado.',
  sem_modelo: 'O Alfred ainda não tem um modelo escolhido (falta definir ALFRED_MODEL no ambiente), então o envio está desativado.',
  modelo_mal_escrito: 'O valor de ALFRED_MODEL não parece um nome de modelo da OpenAI (nomes não têm espaços nem acentos). Confira o valor na Vercel e faça um redeploy; o envio está desativado até lá.',
};

/** Chave e modelo de embedding da base de conhecimento, ou `null` se faltar (a base fica desativada). */
export function embeddingConfig(env: Env = process.env): { apiKey: string; model: string } | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.ALFRED_EMBEDDING_MODEL?.trim();
  return apiKey && model && isValidModelId(model) ? { apiKey, model } : null;
}

/** E-mails dos administradores (podem enviar e apagar documentos). Sem a variável, ninguém é administrador. */
export function adminEmails(env: Env = process.env): string[] {
  return (env.ALFRED_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null, env: Env = process.env): boolean {
  return email !== null && adminEmails(env).includes(email.trim().toLowerCase());
}

export type LibraryUnavailable = 'nao_admin' | 'sem_embedding' | 'sem_servico';

/** Por que o envio de documentos está (ou não) liberado para esta pessoa. */
export function libraryUploadStatus(opts: { isAdmin: boolean; hasServiceKey: boolean; env?: Env }): { available: true } | { available: false; reason: LibraryUnavailable } {
  if (!opts.isAdmin) return { available: false, reason: 'nao_admin' };
  if (!embeddingConfig(opts.env ?? process.env)) return { available: false, reason: 'sem_embedding' };
  if (!opts.hasServiceKey) return { available: false, reason: 'sem_servico' };
  return { available: true };
}

export const LIBRARY_UNAVAILABLE_TEXT: Record<LibraryUnavailable, string> = {
  nao_admin: 'Só administradores adicionam ou removem documentos. Tudo o que está na lista abaixo já faz parte da memória do Alfred para todos.',
  sem_embedding: 'O envio está desativado: falta definir o modelo de embedding no ambiente do servidor (ALFRED_EMBEDDING_MODEL).',
  sem_servico: 'O envio está desativado: falta a chave de serviço do banco no ambiente do servidor.',
};
