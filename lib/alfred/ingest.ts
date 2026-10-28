import { createHash } from 'node:crypto';
import type { Embedder } from './embeddings';
import { ModelError, type ModelErrorKind } from './model';
import { PdfError, chunkPage, openPdf, type PdfReader } from './pdf';

export const MAX_PAGES = 2000;
export const PAGES_PER_STEP = 12;
export const STEP_BUDGET_MS = 30_000;
const LOCK_SECONDS = 120;
const MAX_FAILED_LIST = 500;

export type DocStatus = 'aguardando' | 'processando' | 'concluido' | 'parcial' | 'erro';

export interface DocState {
  id: string;
  storagePath: string;
  status: DocStatus;
  pages: number | null;
  nextPage: number;
  processedPages: number;
  failedPages: number;
  emptyPages: number;
  failedPageList: number[];
  chunks: number;
  contentHash: string | null;
}

export interface ChunkRow {
  page: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface IngestStore {
  /** Trava o documento para este processamento. `null` se não existe ou outro processamento está em andamento. */
  claim(docId: string, lockSeconds: number): Promise<DocState | null>;
  /** Existe outro documento com o mesmo conteúdo? */
  hashExists(hash: string, exceptId: string): Promise<boolean>;
  /** Grava os trechos; trechos que já existem (mesmo documento, página e posição) são ignorados. */
  insertChunks(docId: string, rows: ChunkRow[]): Promise<void>;
  /** Atualiza o documento. `releaseLock` solta a trava. */
  save(docId: string, patch: Partial<Omit<DocState, 'id' | 'storagePath'>> & { lastError?: string | null; releaseLock?: boolean }): Promise<void>;
}

export type IngestErrorCode = 'ocupado' | 'arquivo_ausente' | 'nao_e_pdf' | 'pdf_protegido' | 'pdf_ilegivel' | 'pdf_muito_grande' | 'duplicado' | 'sem_texto' | ModelErrorKind | 'falha_ao_salvar';

export type StepResult =
  | { ok: true; done: boolean; status: DocStatus; pages: number; processedPages: number; failedPages: number; emptyPages: number }
  | { ok: false; error: IngestErrorCode; retryable: boolean };

export interface IngestDeps {
  store: IngestStore;
  download(storagePath: string): Promise<Uint8Array | null>;
  embedder: Embedder;
  open?: (bytes: Uint8Array) => Promise<PdfReader>;
  now?: () => number;
  pagesPerStep?: number;
  budgetMs?: number;
}

/** Erros do provedor que repetir não resolve: o documento fica em "Erro" e pode ser reprocessado depois de ajustar. */
const PERSISTENT: ModelErrorKind[] = ['chave_invalida', 'modelo_invalido', 'sem_credito', 'requisicao_recusada'];

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Lê um pedaço do PDF (algumas páginas), guarda os trechos com embedding e avança o cursor. Pode ser chamado
 * quantas vezes for preciso até `done`: retoma de onde parou, é seguro repetir e uma trava impede dois
 * processamentos ao mesmo tempo no mesmo documento. Páginas que falham ou não têm texto são contadas, nunca escondidas.
 */
export async function processStep(deps: IngestDeps, docId: string): Promise<StepResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const started = now();
  const doc = await store.claim(docId, LOCK_SECONDS);
  if (!doc) return { ok: false, error: 'ocupado', retryable: true };

  const fail = async (error: IngestErrorCode, retryable: boolean, status: DocStatus | null = 'erro'): Promise<StepResult> => {
    await store.save(docId, { ...(status ? { status } : {}), lastError: error, releaseLock: true }).catch(() => undefined);
    return { ok: false, error, retryable };
  };

  let reader: PdfReader | null = null;
  try {
    const bytes = await deps.download(doc.storagePath);
    if (!bytes) return await fail('arquivo_ausente', false);

    let hash = doc.contentHash;
    if (!hash) {
      hash = sha256(bytes);
      if (await store.hashExists(hash, docId)) return await fail('duplicado', false);
      await store.save(docId, { contentHash: hash });
    }

    try {
      reader = await (deps.open ?? openPdf)(bytes);
    } catch (error) {
      return await fail(error instanceof PdfError ? error.kind : 'pdf_ilegivel', false);
    }
    const pages = doc.pages ?? reader.numPages;
    if (pages > MAX_PAGES) return await fail('pdf_muito_grande', false);

    const limit = deps.pagesPerStep ?? PAGES_PER_STEP;
    const budget = deps.budgetMs ?? STEP_BUDGET_MS;
    const found: Array<{ page: number; chunks: string[] }> = [];
    const failedNow: number[] = [];
    let emptyNow = 0;
    let next = doc.nextPage;
    for (let seen = 0; next <= pages && seen < limit && (seen === 0 || now() - started < budget); seen += 1, next += 1) {
      let text: string;
      try {
        text = await reader.pageText(next);
      } catch {
        failedNow.push(next);
        continue;
      }
      const chunks = chunkPage(text);
      if (chunks.length === 0) emptyNow += 1;
      else found.push({ page: next, chunks });
    }

    const flat = found.flatMap((f) => f.chunks.map((content, chunkIndex) => ({ page: f.page, chunkIndex, content })));
    if (flat.length > 0) {
      let vectors: number[][];
      try {
        vectors = await deps.embedder.embed(flat.map((f) => f.content));
      } catch (error) {
        const kind: ModelErrorKind = error instanceof ModelError ? error.kind : 'indisponivel';
        // Sem avançar o cursor: repetir o passo refaz exatamente estas páginas.
        return PERSISTENT.includes(kind) ? await fail(kind, false) : await fail(kind, true, null);
      }
      await store.insertChunks(docId, flat.map((f, i) => ({ ...f, embedding: vectors[i]! })));
    }

    const totalChunks = doc.chunks + flat.length;
    const processed = doc.processedPages + found.length;
    const failed = doc.failedPages + failedNow.length;
    const empty = doc.emptyPages + emptyNow;
    const done = next > pages;
    const status: DocStatus = !done ? 'processando' : totalChunks === 0 ? 'erro' : failed > 0 ? 'parcial' : 'concluido';
    await store.save(docId, {
      status,
      pages,
      nextPage: next,
      processedPages: processed,
      failedPages: failed,
      emptyPages: empty,
      failedPageList: [...doc.failedPageList, ...failedNow].slice(0, MAX_FAILED_LIST),
      chunks: totalChunks,
      lastError: done && totalChunks === 0 ? 'sem_texto' : null,
      releaseLock: true,
    });
    return { ok: true, done, status, pages, processedPages: processed, failedPages: failed, emptyPages: empty };
  } catch {
    return await fail('falha_ao_salvar', true, null);
  } finally {
    await reader?.close().catch(() => undefined);
  }
}
