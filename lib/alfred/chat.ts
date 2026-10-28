import { saoPauloDate } from '@/lib/data/dates';
import { MAX_MESSAGE_CHARS, type SendResult } from './errors';
import { citedSources, knowledgeQuery, type Excerpt, type KnowledgeSearch } from './knowledge';
import type { ChatMessageData, ChatSource } from './types';
import { ModelError, type AlfredModel, type ChatTurn } from './model';
import { ALFRED_SYSTEM_PROMPT, systemPromptWithKnowledge } from './persona';

/** Quantas mensagens anteriores e quantos caracteres, no máximo, vão como contexto para o modelo. */
export const CONTEXT_MESSAGES = 30;
export const CONTEXT_CHARS = 30_000;

/** Gravação e leitura das conversas do usuário logado (a RLS garante o dono). */
export interface ChatStore {
  conversationExists(id: string): Promise<boolean>;
  createConversation(title: string): Promise<string>;
  addMessage(conversationId: string, role: 'user' | 'assistant', content: string, sources?: ChatSource[]): Promise<ChatMessageData>;
  /** Últimas mensagens, da mais antiga para a mais nova. */
  recentTurns(conversationId: string, limit: number): Promise<ChatTurn[]>;
  touch(conversationId: string): Promise<void>;
}

/** Contador diário: `consume` devolve o total ou `null` se o limite foi atingido. */
export interface Quota {
  consume(day: string, limit: number): Promise<number | null>;
  refund(day: string): Promise<void>;
}

export function titleFrom(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Nova conversa';
  const clean = line.replace(/\s+/g, ' ');
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

/** Mantém as mensagens mais recentes que cabem no limite de caracteres (a nova mensagem sempre entra). */
export function fitContext(history: ChatTurn[], budget = CONTEXT_CHARS): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i]!;
    if (kept.length > 0 && used + turn.content.length > budget) break;
    kept.unshift(turn);
    used += turn.content.length;
  }
  // O contexto deve começar por uma mensagem do usuário.
  while (kept.length > 1 && kept[0]!.role !== 'user') kept.shift();
  return kept;
}

/**
 * Envia uma mensagem e devolve a resposta. Nada é gravado se o modelo falhar (o usuário mantém o texto e
 * tenta de novo) e a cota é devolvida. A mensagem e a resposta são gravadas juntas, só depois do sucesso.
 */
export async function sendMessage(deps: { store: ChatStore; quota: Quota; model: AlfredModel; dailyLimit: number; knowledge?: KnowledgeSearch; now?: Date }, input: { conversationId: string | null; text: string }): Promise<SendResult> {
  const { store, quota, model } = deps;
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'mensagem_vazia' };
  if (text.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'mensagem_longa' };

  let history: ChatTurn[] = [];
  if (input.conversationId) {
    if (!(await store.conversationExists(input.conversationId))) return { ok: false, error: 'conversa_inexistente' };
    history = await store.recentTurns(input.conversationId, CONTEXT_MESSAGES);
  }

  const day = saoPauloDate(deps.now ?? new Date());
  if ((await quota.consume(day, deps.dailyLimit)) === null) return { ok: false, error: 'limite_diario' };

  // Consulta a base de conhecimento. Se a busca falhar, responde sem ela e AVISA na própria resposta.
  let excerpts: Excerpt[] = [];
  let knowledgeFailed = false;
  const query = deps.knowledge ? knowledgeQuery(history, text) : '';
  if (deps.knowledge && query) {
    try {
      excerpts = await deps.knowledge.search(query);
    } catch {
      knowledgeFailed = true;
    }
  }

  let answer: string;
  try {
    const system = excerpts.length > 0 ? systemPromptWithKnowledge(excerpts) : ALFRED_SYSTEM_PROMPT;
    answer = await model.complete(system, fitContext([...history, { role: 'user', content: text }]));
  } catch (error) {
    await quota.refund(day).catch(() => undefined);
    return error instanceof ModelError ? { ok: false, error: error.kind, ...(error.detail ? { detail: error.detail } : {}) } : { ok: false, error: 'indisponivel' };
  }

  if (knowledgeFailed) answer += '\n\n_Nota: não consegui consultar a base de conhecimento agora; esta resposta não usa os documentos da biblioteca._';
  try {
    const conversationId = input.conversationId ?? (await store.createConversation(titleFrom(text)));
    const userMessage = await store.addMessage(conversationId, 'user', text);
    const assistantMessage = await store.addMessage(conversationId, 'assistant', answer, citedSources(answer, excerpts));
    await store.touch(conversationId);
    return { ok: true, conversationId, userMessage, assistantMessage };
  } catch (error) {
    await quota.refund(day).catch(() => undefined);
    // Código técnico do banco (ex.: 42703 = coluna inexistente, 42501 = sem permissão), para achar a causa.
    const code = (error as { code?: unknown } | null)?.code;
    return { ok: false, error: 'falha_ao_salvar', ...(typeof code === 'string' && /^[A-Za-z0-9_]{3,12}$/.test(code) ? { detail: code } : {}) };
  }
}
