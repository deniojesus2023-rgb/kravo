import type { ChatTurn } from './model';
import type { ChatSource } from './types';

export interface Excerpt {
  documentId: string;
  documentName: string;
  page: number;
  content: string;
}

/** Busca na base de conhecimento (a implementação real fica em `knowledge-store.ts`). */
export interface KnowledgeSearch {
  search(query: string): Promise<Excerpt[]>;
}

export const MAX_QUERY_CHARS = 1500;

/**
 * Texto usado na busca: a pergunta atual e a pergunta anterior do usuário (para perguntas de continuação como
 * "e para o público frio?"). Vazio quando é curto demais para buscar algo útil (um "oi").
 */
export function knowledgeQuery(history: ChatTurn[], text: string): string {
  const previous = [...history].reverse().find((t) => t.role === 'user')?.content ?? '';
  const q = `${previous.slice(0, 400)}\n${text}`.trim().slice(-MAX_QUERY_CHARS);
  return text.trim().length < 12 && previous.length === 0 ? '' : q;
}

/** Fontes de fato usadas: só os números [n] que aparecem na resposta, sem repetir documento e página. */
export function citedSources(answer: string, excerpts: Excerpt[]): ChatSource[] {
  const out: ChatSource[] = [];
  const seen = new Set<string>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const e = excerpts[Number(m[1]) - 1];
    if (!e) continue;
    const key = `${e.documentId}:${e.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ documentId: e.documentId, documentName: e.documentName, page: e.page });
  }
  return out;
}
