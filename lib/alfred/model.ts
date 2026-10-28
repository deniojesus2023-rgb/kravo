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
  /** `detail`: código técnico curto do provedor (ex.: "unsupported_parameter / max_tokens"), já filtrado. Nunca a mensagem. */
  constructor(
    readonly kind: ModelErrorKind,
    readonly detail: string | null = null,
  ) {
    super(kind);
  }
}

/** Nome de modelo da OpenAI: letras, números e . _ : / - (sem espaços). Pega erro de digitação antes de chamar o provedor. */
export const isValidModelId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(id);

const SAFE_TOKEN = /^[A-Za-z0-9_.\-\[\]]{1,60}$/;

/**
 * Transforma a resposta de erro do provedor num código fixo e num detalhe técnico curto (código, parâmetro, tipo).
 * O texto da mensagem do provedor só é lido para classificar e nunca é devolvido nem guardado.
 */
export function classifyProviderError(status: number, error: { code?: unknown; param?: unknown; type?: unknown; message?: unknown } | undefined): ModelError {
  const part = (v: unknown) => (typeof v === 'string' && SAFE_TOKEN.test(v) ? v : null);
  const code = part(error?.code);
  const detail = [code, part(error?.param), part(error?.type)].filter(Boolean).join(' / ') || null;
  const message = typeof error?.message === 'string' ? error.message : '';
  const kind = ((): ModelErrorKind => {
    if (status === 401 || status === 403) return 'chave_invalida';
    if (code === 'insufficient_quota') return 'sem_credito';
    if (status === 429) return 'limite_do_provedor';
    if (status === 404 || code === 'model_not_found') return 'modelo_invalido';
    if (status >= 500) return 'indisponivel';
    // 400 com modelo inexistente, mal escrito ou que não serve para este tipo de chamada.
    if (/invalid model|model .*(does not exist|not found|not supported)|not a chat model|only supported in v1\/responses/i.test(message)) return 'modelo_invalido';
    return 'requisicao_recusada';
  })();
  return new ModelError(kind, detail);
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
      const body = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { code?: unknown; param?: unknown; type?: unknown; message?: unknown } };
      if (!response.ok) throw classifyProviderError(response.status, body.error);
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ModelError('resposta_vazia');
      return content.trim();
    },
  };
}
