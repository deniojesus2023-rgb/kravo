/**
 * Camada entre o Alfred e o provedor de IA. O resto do app só conhece `AlfredModel`; trocar de provedor
 * é escrever outra função como `createOpenAIModel`. Erros viram códigos fixos: nada do corpo da resposta,
 * da chave ou do texto da conversa entra em mensagem de erro ou log.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AlfredModel {
  complete(system: string, turns: ChatTurn[]): Promise<string>;
}

export type ModelErrorKind = 'chave_invalida' | 'modelo_invalido' | 'sem_credito' | 'limite_do_provedor' | 'requisicao_recusada' | 'indisponivel' | 'resposta_vazia';

export class ModelError extends Error {
  constructor(readonly kind: ModelErrorKind) {
    super(kind);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 2500;

export function createOpenAIModel(opts: { apiKey: string; model: string; fetcher?: FetchLike; timeoutMs?: number; url?: string }): AlfredModel {
  const fetcher = opts.fetcher ?? (fetch as FetchLike);
  return {
    async complete(system, turns) {
      let response: Response;
      try {
        response = await fetcher(opts.url ?? OPENAI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({ model: opts.model, messages: [{ role: 'system', content: system }, ...turns], max_completion_tokens: MAX_OUTPUT_TOKENS }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 55_000),
        });
      } catch {
        throw new ModelError('indisponivel');
      }
      const body = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { code?: unknown; type?: unknown } };
      if (!response.ok) {
        const code = String(body.error?.code ?? '');
        if (response.status === 401 || response.status === 403) throw new ModelError('chave_invalida');
        if (code === 'insufficient_quota') throw new ModelError('sem_credito');
        if (response.status === 429) throw new ModelError('limite_do_provedor');
        if (response.status === 404 || code === 'model_not_found') throw new ModelError('modelo_invalido');
        if (response.status >= 500) throw new ModelError('indisponivel');
        throw new ModelError('requisicao_recusada');
      }
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ModelError('resposta_vazia');
      return content.trim();
    },
  };
}
