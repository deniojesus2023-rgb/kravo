import { describe, expect, it } from 'vitest';
import type { Embedder } from '@/lib/alfred/embeddings';
import { processStep, type ChunkRow, type DocState, type IngestDeps, type IngestStore } from '@/lib/alfred/ingest';
import { ModelError } from '@/lib/alfred/model';
import type { PdfReader } from '@/lib/alfred/pdf';
import { makePdf } from './pdf-fixture';

const PARA = 'Este parágrafo fala sobre oferta, garantia e prova social em uma página de vendas. ';

function memory(initial: Partial<DocState> = {}, hashes: string[] = []) {
  const doc: DocState & { lastError?: string | null; locked: boolean } = { id: 'd1', storagePath: 'd1.pdf', status: 'aguardando', pages: null, nextPage: 1, processedPages: 0, failedPages: 0, emptyPages: 0, failedPageList: [], chunks: 0, contentHash: null, locked: false, ...initial };
  const chunks = new Map<string, ChunkRow>();
  const store: IngestStore = {
    claim: async () => {
      if (doc.locked) return null;
      doc.locked = true;
      return { ...doc, failedPageList: [...doc.failedPageList] };
    },
    hashExists: async (h) => hashes.includes(h),
    insertChunks: async (_id, rows) => {
      for (const r of rows) chunks.set(`${r.page}:${r.chunkIndex}`, r);
    },
    save: async (_id, patch) => {
      const { releaseLock, lastError, ...rest } = patch;
      Object.assign(doc, rest);
      if (lastError !== undefined) doc.lastError = lastError;
      if (releaseLock) doc.locked = false;
    },
  };
  return { doc, chunks, store };
}
const vec = (text: string) => [text.length, 1, 0];
const embedder = (log: string[][] = []): Embedder => ({ embed: async (texts) => (log.push(texts), texts.map(vec)) });
const run = (m: ReturnType<typeof memory>, pdf: Uint8Array | null, over: Partial<IngestDeps> = {}) => processStep({ store: m.store, download: async () => pdf, embedder: embedder(), ...over }, 'd1');

describe('ingestão de PDF', () => {
  it('lê tudo de uma vez, guarda trechos com a página e conclui', async () => {
    const m = memory();
    const r = await run(m, makePdf([PARA, 'Segunda página sobre funis de vendas e criativos.']));
    expect(r).toMatchObject({ ok: true, done: true, status: 'concluido', pages: 2, processedPages: 2, failedPages: 0 });
    expect([...m.chunks.values()].map((c) => c.page)).toEqual([1, 2]);
    expect(m.doc).toMatchObject({ status: 'concluido', chunks: 2, nextPage: 3, locked: false });
    expect(m.doc.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('processa em partes e retoma de onde parou, mostrando progresso real', async () => {
    const m = memory();
    const pdf = makePdf(['um', 'dois', 'três', 'quatro', 'cinco'].map((t) => `${t} ${PARA}`));
    const seen: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const r = await run(m, pdf, { pagesPerStep: 2 });
      if (!r.ok) throw new Error(r.error);
      seen.push(r.processedPages);
      if (r.done) break;
    }
    expect(seen).toEqual([2, 4, 5]);
    expect(m.doc.status).toBe('concluido');
    expect(m.chunks.size).toBe(5);
  });

  it('o orçamento de tempo interrompe o passo, mas sempre lê ao menos uma página', async () => {
    const m = memory();
    let t = 0;
    const r = await run(m, makePdf([PARA, PARA, PARA]), { budgetMs: 10, now: () => (t += 100) });
    expect(r).toMatchObject({ ok: true, done: false, processedPages: 1 });
    expect(m.doc.nextPage).toBe(2);
  });

  it('página que falha vira "parcial" e fica registrada; as outras seguem', async () => {
    const m = memory();
    const reader: PdfReader = { numPages: 3, pageText: async (p) => (p === 2 ? Promise.reject(new Error('corrompida')) : PARA), close: async () => undefined };
    const r = await run(m, new Uint8Array([1]), { open: async () => reader });
    expect(r).toMatchObject({ ok: true, done: true, status: 'parcial', processedPages: 2, failedPages: 1 });
    expect(m.doc.failedPageList).toEqual([2]);
  });

  it('páginas sem texto (capa, imagem) não são falha: contam à parte e o documento conclui', async () => {
    const m = memory();
    const r = await run(m, makePdf([PARA, '', PARA]));
    expect(r).toMatchObject({ ok: true, status: 'concluido', processedPages: 2, failedPages: 0, emptyPages: 1 });
  });

  it('PDF sem nenhum texto (escaneado) termina em erro "sem_texto", sem fingir leitura', async () => {
    const m = memory();
    const r = await run(m, makePdf(['', '']));
    expect(r).toMatchObject({ ok: true, done: true, status: 'erro' });
    expect(m.doc).toMatchObject({ status: 'erro', lastError: 'sem_texto', chunks: 0 });
    expect(m.chunks.size).toBe(0);
  });

  it('arquivo que não é PDF, ausente ou duplicado vira erro com código fixo e solta a trava', async () => {
    const a = memory();
    expect(await run(a, new TextEncoder().encode('texto qualquer'))).toMatchObject({ ok: false, error: 'nao_e_pdf', retryable: false });
    expect(a.doc).toMatchObject({ status: 'erro', lastError: 'nao_e_pdf', locked: false });
    const b = memory();
    expect(await run(b, null)).toMatchObject({ ok: false, error: 'arquivo_ausente' });
    const c = memory();
    const pdf = makePdf([PARA]);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(pdf).digest('hex');
    const dup = memory({}, [hash]);
    expect(await run(dup, pdf)).toMatchObject({ ok: false, error: 'duplicado' });
    expect(dup.doc.status).toBe('erro');
    expect(c.chunks.size).toBe(0);
  });

  it('outro processamento em andamento: responde "ocupado" sem mexer em nada', async () => {
    const m = memory({}, []);
    m.doc.locked = true;
    expect(await run(m, makePdf([PARA]))).toEqual({ ok: false, error: 'ocupado', retryable: true });
    expect(m.chunks.size).toBe(0);
  });

  it('erro passageiro do provedor: não avança o cursor e pode repetir; depois conclui sem duplicar', async () => {
    const m = memory();
    const pdf = makePdf([PARA, PARA]);
    let fails = 1;
    const flaky: Embedder = { embed: async (t) => (fails-- > 0 ? Promise.reject(new ModelError('limite_do_provedor')) : t.map(vec)) };
    const first = await run(m, pdf, { embedder: flaky });
    expect(first).toEqual({ ok: false, error: 'limite_do_provedor', retryable: true });
    expect(m.doc).toMatchObject({ nextPage: 1, processedPages: 0, locked: false });
    const second = await run(m, pdf, { embedder: flaky });
    expect(second).toMatchObject({ ok: true, status: 'concluido' });
    expect(m.chunks.size).toBe(2);
  });

  it.each(['chave_invalida', 'modelo_invalido', 'sem_credito'] as const)('erro permanente (%s) deixa o documento em "erro", com o código', async (kind) => {
    const m = memory();
    const bad: Embedder = { embed: async () => Promise.reject(new ModelError(kind)) };
    expect(await run(m, makePdf([PARA]), { embedder: bad })).toEqual({ ok: false, error: kind, retryable: false });
    expect(m.doc).toMatchObject({ status: 'erro', lastError: kind, nextPage: 1, locked: false });
  });

  it('falha ao gravar solta a trava e permite tentar de novo', async () => {
    const m = memory();
    m.store.insertChunks = async () => Promise.reject(new Error('db'));
    expect(await run(m, makePdf([PARA]))).toEqual({ ok: false, error: 'falha_ao_salvar', retryable: true });
    expect(m.doc.locked).toBe(false);
  });

  it('manda ao provedor só texto das páginas, em um pedido por passo', async () => {
    const m = memory();
    const log: string[][] = [];
    await run(m, makePdf([PARA, PARA]), { embedder: embedder(log) });
    expect(log).toHaveLength(1);
    expect(log[0]).toHaveLength(2);
  });
});
