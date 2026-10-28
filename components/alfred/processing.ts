import { processStepAction } from '@/app/alfred/biblioteca/actions';
import { INGEST_ERROR_TEXT } from '@/lib/alfred/errors';

export interface Progress {
  processed: number;
  pages: number;
}

export type RunResult = { ok: true; status: string } | { ok: false; message: string };

/**
 * Lê o documento em partes, repetindo o passo no servidor até terminar. O progresso vem do que o servidor
 * realmente leu. Erros passageiros (provedor ocupado) são tentados de novo algumas vezes, com espera.
 */
export async function runProcessing(docId: string, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<RunResult> {
  let transient = 0;
  for (let guard = 0; guard < 600; guard += 1) {
    if (signal?.aborted) return { ok: false, message: 'Leitura interrompida. Use "Continuar" para retomar de onde parou.' };
    let r;
    try {
      r = await processStepAction(docId);
    } catch {
      r = { ok: false as const, error: 'indisponivel' as const, retryable: true };
    }
    if (r.ok) {
      transient = 0;
      onProgress({ processed: r.processedPages + r.failedPages + r.emptyPages, pages: r.pages });
      if (r.done) return { ok: true, status: r.status };
      continue;
    }
    const retryable = 'retryable' in r ? r.retryable : false;
    if (retryable && transient < 4) {
      transient += 1;
      await new Promise((res) => setTimeout(res, 1500 * transient));
      continue;
    }
    return { ok: false, message: INGEST_ERROR_TEXT[r.error] ?? INGEST_ERROR_TEXT.indisponivel };
  }
  return { ok: false, message: 'O documento é grande: use "Continuar" para seguir a leitura.' };
}
