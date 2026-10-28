/**
 * Embeddings (vetores) para a base de conhecimento. O banco guarda vetores de 1536 números, então a requisição
 * pede `dimensions: 1536`: qualquer modelo que aceite esse parâmetro serve; um que não aceite falha com erro claro.
 * Erros viram códigos fixos; nada do corpo da resposta nem da chave vai a mensagem ou log.
 */

import { ModelError } from './model';

export const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const BATCH = 64;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

export interface Embedder {
  /** Um vetor por texto, na mesma ordem. */
  embed(texts: string[]): Promise<number[][]>;
}

export function createOpenAIEmbedder(opts: { apiKey: string; model: string; fetcher?: FetchLike; timeoutMs?: number; url?: string }): Embedder {
  const fetcher = opts.fetcher ?? (fetch as FetchLike);

  async function batch(input: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetcher(opts.url ?? OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ model: opts.model, input, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 40_000),
      });
    } catch {
      throw new ModelError('indisponivel');
    }
    const body = (await response.json().catch(() => ({}))) as { data?: Array<{ index?: number; embedding?: unknown }>; error?: { code?: unknown } };
    if (!response.ok) {
      const code = String(body.error?.code ?? '');
      if (response.status === 401 || response.status === 403) throw new ModelError('chave_invalida');
      if (code === 'insufficient_quota') throw new ModelError('sem_credito');
      if (response.status === 429) throw new ModelError('limite_do_provedor');
      if (response.status === 404 || code === 'model_not_found') throw new ModelError('modelo_invalido');
      if (response.status >= 500) throw new ModelError('indisponivel');
      throw new ModelError('requisicao_recusada');
    }
    const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== input.length) throw new ModelError('resposta_vazia');
    return rows.map((r) => {
      const v = r.embedding;
      if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) throw new ModelError('requisicao_recusada');
      return v as number[];
    });
  }

  return {
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) out.push(...(await batch(texts.slice(i, i + BATCH))));
      return out;
    },
  };
}
